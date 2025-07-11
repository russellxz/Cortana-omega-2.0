(async () => {
let canalId = ["120363266665814365@newsletter"];  
let canalNombre = ["🪼 CORTANA 2.0 BOT 🪼"]
  function setupConnection(conn) {
  conn.sendMessage2 = async (chat, content, m, options = {}) => {
    const firstChannel = { 
      id: canalId[0], 
      nombre: canalNombre[0] 
    };
    if (content.sticker) {
      return conn.sendMessage(chat, { 
        sticker: content.sticker 
      }, { 
        quoted: m,
        ...options 
      });
    }
    const messageOptions = {
      ...content,
      mentions: content.mentions || options.mentions || [],
      contextInfo: {
        ...(content.contextInfo || {}),
        forwardedNewsletterMessageInfo: {
          newsletterJid: firstChannel.id,
          serverMessageId: '',
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


// subbots sistema
async function reconectarSubbotsExistentes() {
  const subbotsDir = path.resolve("./subbots");
  if (!fs.existsSync(subbotsDir)) return;

  const carpetas = fs.readdirSync(subbotsDir);
  for (const carpeta of carpetas) {
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
  
async function iniciarSubbotDesdePath(sessionPath) {
  const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, default: makeWASocket } = require('@whiskeysockets/baileys');
  const pino = require("pino");

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const socky = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    printQRInTerminal: false,
    browser: ['Subbot', 'Chrome']
  });

  socky.sessionPath = sessionPath;
  gestionarConexion(socky, true);
  socky.ev.on("creds.update", saveCreds);
}
//sistema subbots  
const { Boom } = require("@hapi/boom");

let reconnectionAttempts = {}; // ✅ GLOBAL

function gestionarConexion(sock, isSubbot = false) {
  const sessionPath = sock.sessionPath || "./sessions";
  const idSesion = sessionPath.split(/[\\/]/).pop();
  const maxIntentos = 3;

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect } = update;
      const reasonCode = new Boom(lastDisconnect?.error)?.output?.statusCode || 0;
      const reasonText = require("@whiskeysockets/baileys").DisconnectReason[reasonCode] || "Motivo desconocido";

      if (connection === "connecting") {
        console.log(chalk.blue(`🔄 Conectando a WhatsApp... (${isSubbot ? "subbot" : "bot principal"})`));
      }

      else if (connection === "open") {
        console.log(chalk.green(`✅ ¡Conexión establecida con éxito! (${isSubbot ? "subbot" : "bot principal"})`));
        
        if (isSubbot) {
          console.log(chalk.cyan(`🤖 Subbot ${chalk.bold(idSesion)} reconectado correctamente.`));
        }

        reconnectionAttempts[idSesion] = 0;

        if (!isSubbot) {
          const restarterFile = "./lastRestarter.json";
          if (fs.existsSync(restarterFile)) {
            const data = JSON.parse(fs.readFileSync(restarterFile, "utf-8"));
            if (data.chatId) {
              await sock.sendMessage(data.chatId, {
                text: "✅ *El bot está en línea nuevamente tras el reinicio.* 🚀"
              });
              fs.unlinkSync(restarterFile);
            }
          }
        }
      }

      else if (connection === "close") {
        console.log(chalk.red(`❌ Conexión cerrada (${isSubbot ? "subbot" : "principal"}: ${idSesion})`));
        console.log(chalk.red(`🔁 Intentando reconectar... Motivo: ${reasonText}`));

        reconnectionAttempts[idSesion] = (reconnectionAttempts[idSesion] || 0) + 1;

        if (isSubbot) {
          if (reconnectionAttempts[idSesion] <= maxIntentos) {
            console.log(chalk.yellow(`🔄 Reintentando subbot (${idSesion}) [Intento ${reconnectionAttempts[idSesion]}/${maxIntentos}]`));
            setTimeout(() => {
              iniciarSubbotDesdePath(sessionPath);
            }, 3000);
          } else {
            console.log(chalk.red(`💥 Subbot (${idSesion}) falló ${maxIntentos} veces. Eliminando sesión.`));
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(chalk.gray(`🧹 Sesión eliminada: ${sessionPath}`));
          }
        } else {
          console.log(chalk.blue("🔄 Reiniciando el bot principal en 5 segundos..."));
          setTimeout(startBot, 5000);
        }
      }

    } catch (err) {
      console.error("❌ Error en gestionarConexion:", err);
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

  
  //nsfw 
async function getPrompt() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/elrebelde21/LoliBot-MD/main/src/text-chatgpt.txt');
    return await res.text();
  } catch {
    return 'Eres un asistente inteligente';
  }
}

  
function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/Maaf, terjadi kesalahan saat memproses permintaan Anda/g, '')
    .replace(/Generated by BLACKBOX\.AI.*?https:\/\/www\.blackbox\.ai/g, '')
    .replace(/and for API requests replace https:\/\/www\.blackbox\.ai with https:\/\/api\.blackbox\.ai/g, '')
    .trim();
}

async function luminaiQuery(q, user, prompt) {
  const { data } = await axios.post('https://luminai.my.id', {
    content: q,
    user: user,
    prompt: prompt,
    webSearchMode: true
  });
  return data.result;
}

async function perplexityQuery(q, prompt) {
  const { data } = await axios.get('https://api.perplexity.ai/chat', {
    params: {
      query: encodeURIComponent(q),
      context: encodeURIComponent(prompt)
    }
  });
  return data.response;
}
  //lumi
  const axios = require("axios");
const fetch = require("node-fetch");
const path = require("path");            
   
    const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
    const chalk = require("chalk");
    const yargs = require('yargs/yargs')
    const { tmpdir } = require('os')
    const { join } = require('path')
    const figlet = require("figlet");
    const fs = require("fs");
    const { readdirSync, statSync, unlinkSync } = require('fs')
    const readline = require("readline");
    const pino = require("pino");
    const { isOwner, getPrefix, allowedPrefixes } = require("./config");
    const { handleCommand } = require("./main"); 
    // Carga de credenciales y estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState("./sessions");
  const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
 
  //lista
function isAllowedUser(sender) {
  const listaFile = "./lista.json";
  if (!fs.existsSync(listaFile)) return false;
  const lista = JSON.parse(fs.readFileSync(listaFile, "utf-8"));
  // Extrae solo los dígitos del número para comparar
  const num = sender.replace(/\D/g, "");
  return lista.includes(num);
}
    
    //privado y admins
const activosPath = "./activos.json"; // ✅ renombrado

// 📂 Cargar configuración de modos desde el archivo JSON
function cargarModos() {
    if (!fs.existsSync(activosPath)) {
        fs.writeFileSync(activosPath, JSON.stringify({ modoPrivado: false, modoAdmins: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(activosPath, "utf-8"));
}

// 📂 Guardar configuración de modos en el archivo JSON
function guardarModos(data) {
    fs.writeFileSync(activosPath, JSON.stringify(data, null, 2));
}

let modos = cargarModos();
    
    // Configuración de consola
    console.log(chalk.cyan(figlet.textSync("Cortana 2.0 Bot", { font: "Standard" })));    
    console.log(chalk.green("\n✅ Iniciando conexión...\n"));
    
    // ✅ Mostrar opciones de conexión bien presentadas
    console.log(chalk.yellow("📡 ¿Cómo deseas conectarte?\n"));
    console.log(chalk.green("  [1] ") + chalk.white("📷 Escanear código QR"));
    console.log(chalk.green("  [2] ") + chalk.white("🔑 Ingresar código de 8 dígitos\n"));

    // Manejo de entrada de usuario
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (text) => new Promise((resolve) => rl.question(text, resolve));

    let method = "1"; // Por defecto: Código QR
    if (!fs.existsSync("./sessions/creds.json")) {
        method = await question(chalk.magenta("📞 Ingresa tu número (Ej: 5491168XXXX) "));

        if (!["1", "2"].includes(method)) {
            console.log(chalk.red("\n❌ Opción inválida. Reinicia el bot y elige 1 o 2."));
            process.exit(1);
        }
    }

    async function startBot() {
        try {
            let { version } = await fetchLatestBaileysVersion();
            const socketSettings = {
                printQRInTerminal: method === "1",
                logger: pino({ level: "silent" }),
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
                browser: method === "1" ? ["AzuraBot", "Safari", "1.0.0"] : ["Ubuntu", "Chrome", "20.0.04"],
            };

            const sock = makeWASocket(socketSettings);
setupConnection(sock)
         //subbott 
         
          // Si la sesión no existe y se usa el código de 8 dígitos
            if (!fs.existsSync("./sessions/creds.json") && method === "2") {
                let phoneNumber = await question("😎Fino vamos aya😎: ");
                phoneNumber = phoneNumber.replace(/\D/g, "");
                setTimeout(async () => {
                    let code = await sock.requestPairingCode(phoneNumber);
                    console.log(chalk.magenta("🔑 Código de vinculación: ") + chalk.yellow(code.match(/.{1,4}/g).join("-")));
                }, 2000);
            }

//_________________

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())

//tmp
if (!opts['test']) {
  setInterval(async () => {
  //  if (global.db.data) await global.db.write().catch(console.error)
    if (opts['autocleartmp']) try {
      clearTmp()

    } catch (e) { console.error(e) }
  }, 60 * 1000)
}

if (opts['server']) (await import('./server.js')).default(global.conn, PORT)

/* Clear */
async function clearTmp() {
  const tmp = [tmpdir(), join(__dirname, './tmp')]
  const filename = []
  tmp.forEach(dirname => readdirSync(dirname).forEach(file => filename.push(join(dirname, file))))

  //---
  return filename.map(file => {
    const stats = statSync(file)
    if (stats.isFile() && (Date.now() - stats.mtimeMs >= 1000 * 60 * 1)) return unlinkSync(file) // 1 minuto
    return false
  })
}

setInterval(async () => {
  await clearTmp()
  console.log(chalk.cyanBright(`╭━─━─━─≪🔆≫─━─━─━╮\n│SE LIMPIO LA CARPETA TMP CORRECTAMENTE\n╰━─━─━─≪🔆≫─━─━─━╯`))
}, 1000 * 60 * 60); // ← 1 hora en milisegundos

//sessions/jadibts
            // Función para verificar si un usuario es administrador en un grupo
            async function isAdmin(sock, chatId, sender) {
                try {
                    const groupMetadata = await sock.groupMetadata(chatId);
                    const admins = groupMetadata.participants
                        .filter(p => p.admin)
                        .map(p => p.id);
                    return admins.includes(sender) || isOwner(sender);
                } catch (error) {
                    console.error("Error verificando administrador:", error);
                    return false;
                }
            }

// Ruta de los archivos a limpiar
const archivosAntidelete = ['./antidelete.json', './antideletepri.json'];

function limpiarAntidelete() {
  for (const archivo of archivosAntidelete) {
    if (fs.existsSync(archivo)) {
      fs.writeFileSync(archivo, JSON.stringify({}, null, 2));
      console.log(`🧹 Archivo limpiado: ${archivo}`);
    }
  }
}

// Ejecutar limpieza cada 30 minutos
setInterval(limpiarAntidelete, 30 * 60 * 1000); // 30 min

// Ejecutar una vez al inicio
limpiarAntidelete();
//cada 30 minutos antidelete          
          
// Función para revisar y actualizar grupos cada 5 segundos
setInterval(async () => {
  try {
    const ahora = Date.now();

    // === REVISAR CIERRE AUTOMÁTICO ===
    const tiempoCerrarPath = path.resolve("./tiempo1.json");
    if (fs.existsSync(tiempoCerrarPath)) {
      const tiempoCerrar = JSON.parse(fs.readFileSync(tiempoCerrarPath, "utf-8"));

      for (const groupId of Object.keys(tiempoCerrar)) {
        const tiempoLimite = tiempoCerrar[groupId];
        if (ahora >= tiempoLimite) {
          console.log(`⏰ Se cumplió el tiempo para CERRAR el grupo: ${groupId}`);

          try {
            await sock.groupSettingUpdate(groupId, "announcement"); // Cerrar grupo
            await sock.sendMessage(groupId, {
              text: "🔒 El grupo ha sido cerrado automáticamente. Solo admins pueden escribir."
            });
          } catch (error) {
            console.error(`❌ Error cerrando grupo ${groupId}:`, error);
          }

          delete tiempoCerrar[groupId];
          fs.writeFileSync(tiempoCerrarPath, JSON.stringify(tiempoCerrar, null, 2));
        }
      }
    }
//limpieza
    
    // === REVISAR APERTURA AUTOMÁTICA ===
    const tiempoAbrirPath = path.resolve("./tiempo2.json");
    if (fs.existsSync(tiempoAbrirPath)) {
      const tiempoAbrir = JSON.parse(fs.readFileSync(tiempoAbrirPath, "utf-8"));

      for (const groupId of Object.keys(tiempoAbrir)) {
        const tiempoLimite = tiempoAbrir[groupId];
        if (ahora >= tiempoLimite) {
          console.log(`⏰ Se cumplió el tiempo para ABRIR el grupo: ${groupId}`);

          try {
            await sock.groupSettingUpdate(groupId, "not_announcement"); // Abrir grupo
            await sock.sendMessage(groupId, {
              text: "🔓 El grupo ha sido abierto automáticamente. ¡Todos pueden escribir!"
            });
          } catch (error) {
            console.error(`❌ Error abriendo grupo ${groupId}:`, error);
          }

          delete tiempoAbrir[groupId];
          fs.writeFileSync(tiempoAbrirPath, JSON.stringify(tiempoAbrir, null, 2));
        }
      }
    }

  } catch (error) {
    console.error("❌ Error en la revisión automática de grupos:", error);
  }
}, 5000); // Revisa cada 5 segundos
//ok de abria onkkkkkk
          


           
            // 🟢 Consola de mensajes entrantes con diseño

sock.ev.on("messages.upsert", async (messageUpsert) => {
  try {
    const msg = messageUpsert.messages[0];
    if (!msg || !msg.message) return;

    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith("@g.us");
    const sender = msg.key.participant
      ? msg.key.participant.replace(/[^0-9]/g, "")
      : msg.key.remoteJid.replace(/[^0-9]/g, "");
    const botNumber = sock.user.id.split(":")[0].replace(/[^0-9]/g, "");
    const fromMe = msg.key.fromMe || sender === botNumber;

    let messageText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      "";

    const isSubbot = sock.sessionPath && sock.sessionPath.includes("subbots");
    const subbotID = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

    // Prefijo personalizado si es subbot
    let customPrefix = ".";
    if (isSubbot) {
      try {
        const prefixPath = require("path").resolve("prefixes.json");
        if (fs.existsSync(prefixPath)) {
          const dataPrefix = JSON.parse(fs.readFileSync(prefixPath));
          customPrefix = dataPrefix[subbotID] || ".";
        }
      } catch (e) {}
    }

    const allowedPrefixes = [customPrefix, "#"];
    const usedPrefix = allowedPrefixes.find((p) => messageText.startsWith(p));
    if (!usedPrefix) return;

    const command = messageText.slice(usedPrefix.length).trim().split(" ")[0].toLowerCase();
    const args = messageText.slice(usedPrefix.length + command.length).trim().split(" ");

    // 🟢 Consola: mostrar info del mensaje
    console.log(chalk.yellow(`\n📩 Nuevo mensaje recibido`));
    console.log(chalk.green(`📨 De: ${fromMe ? "[Tú]" : "[Usuario]"} ${chalk.bold(sender)}${isSubbot ? " [subbot]" : ""}`));
    console.log(chalk.cyan(`💬 Mensaje: ${chalk.bold(messageText || "📂 (Mensaje multimedia)")}`));
    console.log(chalk.gray("──────────────────────────"));

    // Ejecutar comando
    handleCommand(sock, msg, command, args, sender);

  } catch (error) {
    console.error("❌ Error en messages.upsert:", error);
  }
});
            
            







            // Manejo de errores global para evitar que el bot se detenga
            process.on("uncaughtException", (err) => {
                console.error(chalk.red("⚠️ Error no manejado:"), err);
            });

            process.on("unhandledRejection", (reason, promise) => {
                console.error(chalk.red("🚨 Promesa rechazada sin manejar:"), promise, "razón:", reason);
            });

        } catch (error) {
            console.error(chalk.red("❌ Error en la conexión:"), error);
            console.log(chalk.blue("🔄 Reiniciando en 5 segundos..."));
            setTimeout(startBot, 5000); // Intentar reconectar después de 5 segundos en caso de error
        }
    }
await reconectarSubbotsExistentes();

    startBot();
  
})();
