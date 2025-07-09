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

const MAX_SUBBOTS = 75;

const handler = async (msg, { conn, command }) => {
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

      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

      const subbotDirs = fs.readdirSync(sessionDir)
        .filter(d => fs.existsSync(path.join(sessionDir, d, "creds.json")));

      if (subbotDirs.length >= MAX_SUBBOTS) {
        await conn.sendMessage(msg.key.remoteJid, {
          text: `🚫 *Límite alcanzado:* existen ${subbotDirs.length}/${MAX_SUBBOTS} sub-bots conectados.\nIntenta más tarde.`
        }, { quoted: msg });
        return;
      } else {
        const restantes = MAX_SUBBOTS - subbotDirs.length;
        await conn.sendMessage(msg.key.remoteJid, {
          text: `ℹ️ Quedan *${restantes}* espacios disponibles para conectar nuevos sub-bots.`
        }, { quoted: msg });
      }

      await conn.sendMessage(msg.key.remoteJid, { react: { text: '⌛', key: msg.key } });

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();
      const logger = pino({ level: "silent" });

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

      socky.sessionPath = sessionPath; // necesario para saber si es subbot

      socky.ev.on("connection.update", async ({ qr, connection }) => {
        if (qr && !sentCodeMessage) {
          if (usarPairingCode) {
            const code = await socky.requestPairingCode(rid);
            await conn.sendMessage(msg.key.remoteJid, {
              video:  { url: "https://cdn.russellxz.click/b0cbbbd3.mp4" },
              caption: "🔐 *Código generado:*\nAbre WhatsApp > Vincular dispositivo y pega el siguiente código:",
              gifPlayback: true
            }, { quoted: msg });
            await sleep(1000);
            await conn.sendMessage(msg.key.remoteJid, { text: "```" + code + "```" }, { quoted: msg });
          } else {
            const qrImage = await QRCode.toBuffer(qr);
            await conn.sendMessage(msg.key.remoteJid, {
              image: qrImage,
              caption: `📲 Escanea este código QR desde *WhatsApp > Vincular dispositivo* para conectarte como sub-bot.`
            }, { quoted: msg });
          }
          sentCodeMessage = true;
        }

        if (connection === "open") {
          await conn.sendMessage(msg.key.remoteJid, {
            text:
`🤖 𝙎𝙐𝘽𝘽𝙊𝙏 𝘾𝙊𝙉𝙀𝘾𝙏𝘼𝘿𝙊 - Cortana 2.0

✅ Bienvenido al sistema premium de CORTANA 2.0 BOT  
🛰️ Tu subbot ya está en línea y operativo.

📩 *Importante:* Revisa tu mensaje privado para ver las instrucciones.

🛠️ Comandos básicos:  
• \`help\` → Ayuda general  
• \`menu\` → Lista de comandos

✨ Cambiar prefijo:  
Usa: \`.setprefix ✨\`  

🧹 Borrar sesión:  
• \`.delbots\` o vuelve a usar \`.code\` / \`.sercode\`

💎 BY Sky Ultra Plus 💎`
          }, { quoted: msg });

          await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔁", key: msg.key } });

          // Integrar con el sistema del bot principal
          gestionarConexion(socky, true); // usa el mismo sistema que el index.js
          socky.ev.on("creds.update", saveCreds);
        }
      });

    } catch (e) {
      console.error("❌ Error en serbot:", e);
      await conn.sendMessage(msg.key.remoteJid, { text: `❌ *Error inesperado:* ${e.message}` }, { quoted: msg });
    }
  }

  await serbot();
};

handler.command = ["sercode", "code", "jadibot", "serbot", "qr"];
handler.tags    = ["owner"];
handler.help    = ["serbot", "code"];
module.exports  = handler;
