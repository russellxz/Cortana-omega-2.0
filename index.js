(async () => {
  const fs = require("fs");
  const path = require("path");
  const { Boom } = require("@hapi/boom");
  const pino = require("pino");
  const QRCode = require("qrcode");
  const axios = require("axios");
  const fetch = require("node-fetch");
  const chalk = require("chalk");
  const yargs = require("yargs/yargs");
  const { tmpdir } = require("os");
  const { join } = require("path");
  const figlet = require("figlet");
  const { readdirSync, statSync, unlinkSync } = require("fs");
  const readline = require("readline");
  const { isOwner, getPrefix, allowedPrefixes } = require("./config");
  const { handleCommand } = require("./main");
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
  } = require("@whiskeysockets/baileys");

  // ——— Newsletter setup ———
  let canalId     = ["120363266665814365@newsletter"];
  let canalNombre = ["🪼 CORTANA 2.0 BOT 🪼"];

  function setupConnection(conn) {
    conn.sendMessage2 = async (chat, content, m, options = {}) => {
      const firstChannel = { id: canalId[0], nombre: canalNombre[0] };
      if (content.sticker) {
        return conn.sendMessage(chat, { sticker: content.sticker }, { quoted: m, ...options });
      }
      const messageOptions = {
        ...content,
        mentions: content.mentions || options.mentions || [],
        contextInfo: {
          ...(content.contextInfo || {}),
          forwardedNewsletterMessageInfo: {
            newsletterJid: firstChannel.id,
            serverMessageId: "",
            newsletterName: firstChannel.nombre
          },
          forwardingScore: 9999999,
          isForwarded: true,
          mentionedJid: content.mentions || options.mentions || []
        }
      };
      return conn.sendMessage(chat, messageOptions, {
        quoted: m,
        ephemeralExpiration: 86400000,
        disappearingMessagesInChat: 86400000,
        ...options
      });
    };
  }

  // ——— Reconectar subbots existentes al inicio ———
  async function reconectarSubbotsExistentes() {
    const subbotsDir = path.resolve("./subbots");
    if (!fs.existsSync(subbotsDir)) return;
    for (const carpeta of fs.readdirSync(subbotsDir)) {
      const credPath = path.join(subbotsDir, carpeta, "creds.json");
      if (fs.existsSync(credPath)) {
        console.log(`🔁 Reestableciendo subbot: ${carpeta}`);
        try {
          await iniciarSubbotDesdePath(path.join(subbotsDir, carpeta));
        } catch (err) {
          console.error(`❌ Error al reconectar subbot ${carpeta}:`, err);
        }
      }
    }
  }

  // ——— Iniciar un subbot desde su carpeta ———
  async function iniciarSubbotDesdePath(sessionPath) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const socky = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys)
      },
      browser: ["Subbot", "Chrome"]
    });

    socky.sessionPath = sessionPath;
    setupConnection(socky);

    // Suscribir lógica de subbot original para ejecutar plugins2
    socky.ev.on("messages.upsert", async mUpsert => {
      const msg = mUpsert.messages[0];
      if (!msg || !msg.message) return;
      const chatId = msg.key.remoteJid;
      const isGroup = chatId.endsWith("@g.us");
      const sender = msg.key.participant
        ? msg.key.participant.replace(/\D/g, "")
        : msg.key.remoteJid.replace(/\D/g, "");
      const subbotID = socky.user.id.split(":")[0] + "@s.whatsapp.net";

      // Prefijo
      const prefixPath = path.resolve("prefixes.json");
      let customPrefix = ".";
      if (fs.existsSync(prefixPath)) {
        const pfx = JSON.parse(fs.readFileSync(prefixPath, "utf-8"));
        customPrefix = pfx[subbotID] || customPrefix;
      }
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";
      const allowed = [customPrefix, "#"];
      const used = allowed.find(p => text.startsWith(p));
      if (!used) return;
      const body = text.slice(used.length).trim();
      const cmd = body.split(" ")[0].toLowerCase();
      const args = body.split(" ").slice(1);

      // Grupo
      if (isGroup) {
        const gpPath = path.resolve("grupo.json");
        let grupos = [];
        if (fs.existsSync(gpPath)) {
          const g = JSON.parse(fs.readFileSync(gpPath, "utf-8"));
          grupos = Array.isArray(g[subbotID]) ? g[subbotID] : [];
        }
        if (!grupos.includes(chatId) && cmd !== "addgrupo") return;
      } else {
        // Privado
        const lpPath = path.resolve("listasubots.json");
        if (!msg.key.fromMe) {
          let list = [];
          if (fs.existsSync(lpPath)) {
            const l = JSON.parse(fs.readFileSync(lpPath, "utf-8"));
            list = Array.isArray(l[subbotID]) ? l[subbotID] : [];
          }
          if (!list.includes(sender)) return;
        }
      }

      // Ejecutar plugin
      const filePath = path.join(__dirname, "plugins2", `${cmd}.js`);
      if (fs.existsSync(filePath)) {
        const plugin = require(filePath);
        if (typeof plugin === "function") {
          await plugin(msg, { conn: socky, text: args.join(" "), command: cmd });
        } else if (plugin.command?.includes(cmd)) {
          await plugin.run(socky, msg, args);
        }
      }
    });

    socky.ev.on("connection.update", ({ connection }) => {
      if (connection === "open") {
        const id = sessionPath.split(path.sep).pop();
        console.log(`✅ Subbot reconectado: ${id}`);
      }
    });

    socky.ev.on("creds.update", saveCreds);
  }

  // ——— Resto de tus funciones originales (getPrompt, cleanResponse, etc.) ———
  async function getPrompt() { /* ... */ }
  function cleanResponse(t)   { /* ... */ }
  async function luminaiQuery(q,u,p) { /* ... */ }
  async function perplexityQuery(q,p) { /* ... */ }
  function isAllowedUser(s)  { /* ... */ }

  // Modos privado/admin
  const activosPath = "./activos.json";
  function cargarModos() { /* ... */ }
  function guardarModos(d) { /* ... */ }
  let modos = cargarModos();

  // ——— Inicio visual y entrada ———
  console.log(chalk.cyan(figlet.textSync("Cortana 2.0 Bot", { font: "Standard" })));
  console.log(chalk.green("\n✅ Iniciando conexión...\n"));
  console.log(chalk.yellow("📡 ¿Cómo deseas conectarte?\n"));
  console.log(chalk.green("  [1] ") + chalk.white("📷 Escanear código QR"));
  console.log(chalk.green("  [2] ") + chalk.white("🔑 Ingresar código de 8 dígitos\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = text => new Promise(res => rl.question(text, res));
  let method = "1";
  if (!fs.existsSync("./sessions/creds.json")) {
    method = await question(chalk.magenta("📞 Ingresa tu número (Ej: 5491168XXXX) "));
    if (!["1","2"].includes(method)) process.exit(1);
  }

  // ——— startBot ———
  async function startBot() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState("./sessions");
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({
        version,
        logger: pino({ level:"silent" }),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
        browser: method==="1"? ["AzuraBot","Safari","1.0.0"] : ["Ubuntu","Chrome","20.0.04"]
      });
      setupConnection(sock);

      // Fallback prefix if getPrefix() missing
      global.prefix = (typeof getPrefix === "function" ? getPrefix() : (allowedPrefixes[0] || "."));

      // Reconexión automática de subbots
      await reconectarSubbotsExistentes();

      sock.ev.on("creds.update", saveCreds);

      // Pairing code manual si método 2
      if (method==="2" && !fs.existsSync("./sessions/creds.json")) {
        let phone = await question("😎 Fino vamos aya 😎: ");
        phone = phone.replace(/\D/g,"");
        setTimeout(async()=>{
          const code = await sock.requestPairingCode(phone);
          console.log(chalk.magenta("🔑 Código de vinculación: ")+chalk.yellow(code.match(/.{1,4}/g).join("-")));
        },2000);
      }

      // Aquí suscribe tus handlers originales de mensajes y conexión
      sock.ev.on("messages.upsert", /* tu handler principal intacto */);
      sock.ev.on("connection.update", /* tu handler principal intacto */);

    } catch (e) {
      console.error(chalk.red("❌ Error en startBot:"), e);
      setTimeout(startBot, 5000);
    }
  }

  // ——— Ejecutar todo ———
  await reconectarSubbotsExistentes();
  startBot();
})();
