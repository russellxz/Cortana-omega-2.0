const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@whiskeysockets/baileys');

// ← Importa aquí tu nueva función directamente desde el index central
const { iniciarSubbotDesdePath } = require('../index');

const MAX_SUBBOTS = 75;

const handler = async (msg, { conn, command, sock }) => {
  const usarPairingCode = ["sercode", "code"].includes(command);
  let sentCodeMessage = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function serbot() {
    try {
      const number      = msg.key?.participant || msg.key.remoteJid;
      const sessionDir  = path.join(__dirname, "../subbots");
      const sessionPath = path.join(sessionDir, number);
      const rid         = number.split("@")[0];

      // ───────── LÍMITES ─────────
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      const subbotDirs = fs.readdirSync(sessionDir)
        .filter(d => fs.existsSync(path.join(sessionDir, d, "creds.json")));
      if (subbotDirs.length >= MAX_SUBBOTS) {
        await conn.sendMessage(msg.key.remoteJid, {
          text: `🚫 *Límite alcanzado:* ${subbotDirs.length}/${MAX_SUBBOTS}.`
        }, { quoted: msg });
        return;
      } else {
        const restantes = MAX_SUBBOTS - subbotDirs.length;
        await conn.sendMessage(msg.key.remoteJid, {
          text: `ℹ️ Quedan *${restantes}* espacios disponibles.`
        }, { quoted: msg });
      }

      await conn.sendMessage(msg.key.remoteJid, { react: { text: '⌛', key: msg.key } });

      // ───────── Autenticación Baileys ─────────
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version }          = await fetchLatestBaileysVersion();
      const logger               = pino({ level: "silent" });

      const socky = makeWASocket({
        version,
        logger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: !usarPairingCode,
        browser: ['Windows', 'Chrome'],
        syncFullHistory: false,
      });

      let reconnectionAttempts = 0;
      const maxReconnectionAttempts = 3;

      socky.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
        // ───────── QR / Código pairing ─────────
        if (qr && !sentCodeMessage) {
          if (usarPairingCode) {
            const code = await socky.requestPairingCode(rid);
            await conn.sendMessage(msg.key.remoteJid, {
              video:  { url: "https://cdn.russellxz.click/b0cbbbd3.mp4" },
              caption:"🔐 *Código generado:* pega este código en WhatsApp → Vincular dispositivo",
              gifPlayback: true
            }, { quoted: msg });
            await sleep(1000);
            await conn.sendMessage(msg.key.remoteJid, { text: "```" + code + "```" }, { quoted: msg });
          } else {
            const qrImage = await QRCode.toBuffer(qr);
            await conn.sendMessage(msg.key.remoteJid, {
              image: qrImage,
              caption: "📲 Escanea este QR en WhatsApp → Vincular dispositivo"
            }, { quoted: msg });
          }
          sentCodeMessage = true;
        }

        switch (connection) {
          case "open":
            // … todo tu mensaje de bienvenida intacto …
            await conn.sendMessage(msg.key.remoteJid, {
              text: `🤖 𝙎𝙐𝘽𝘽𝙊𝙏 𝘾𝙊𝙉𝙀𝘾𝙏𝘼𝘿𝙊 …`
            }, { quoted: msg });
            await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔁", key: msg.key } });

            // ← Aquí llamamos a la nueva función de tu index central
            try {
              await iniciarSubbotDesdePath(sessionPath);
            } catch (err) {
              console.error("[Subbots] Error al iniciar sesión nueva:", err);
            }
            break;

          case "close": {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const reasonText = DisconnectReason[code] || `Código desconocido: ${code}`;
            const eliminar = () => {
              if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            };
            switch (code) {
              case DisconnectReason.badSession:
              case DisconnectReason.loggedOut:
                await conn.sendMessage(msg.key.remoteJid, {
                  text: `⚠️ Sesión eliminada.\n${reasonText}\nUsa ${global.prefix}sercode para reconectar.`
                }, { quoted: msg });
                eliminar();
                break;
              case DisconnectReason.restartRequired:
                if (reconnectionAttempts++ < maxReconnectionAttempts) {
                  await sleep(3000);
                  return serbot();
                }
                await conn.sendMessage(msg.key.remoteJid, { text: `⚠️ Reintentos fallidos.` }, { quoted: msg });
                break;
              default:
                await conn.sendMessage(msg.key.remoteJid, {
                  text: `⚠️ Problema de conexión: ${reasonText}\nEjecuta #delbots y vuelve a #sercode.`
                }, { quoted: msg });
            }
            break;
          }
        }
      });

      socky.ev.on("creds.update", saveCreds);

    } catch (e) {
      console.error("❌ Error en serbot:", e);
      await conn.sendMessage(msg.key.remoteJid, { text: `❌ Error inesperado: ${e.message}` }, { quoted: msg });
    }
  }

  await serbot();
};

handler.command = ["sercode", "code", "jadibot", "serbot", "qr"];
handler.tags    = ["owner"];
handler.help    = ["serbot", "code"];
module.exports  = handler;
