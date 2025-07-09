const fs = require("fs");
const path = require("path");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const handler = async (msg, { conn, text }) => {
  try {
    const rawID = conn.user?.id || "";
    const subbotID = rawID.split(":")[0] + "@s.whatsapp.net";

    const chatJid = msg.key.remoteJid;
    const isGroup = chatJid.endsWith("@g.us");
    const senderJid = isGroup ? msg.key.participant : subbotID;
    const isFromSubbot = msg.key.fromMe === true && senderJid === subbotID;

    if (!isFromSubbot) {
      return await conn.sendMessage(chatJid, {
        text: "❌ Este comando solo puede ser usado por el *subbot desde su propio número* (grupo o privado).",
      }, { quoted: msg });
    }

    const setMenuPath = path.resolve("setmenu.json");
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const imageMsg = quoted?.imageMessage;

    if (!imageMsg || !text) {
      return await conn.sendMessage(chatJid, {
        text: `📌 *Uso correcto del comando:*\n\nResponde a una imagen con el comando:\n*setmenu NombreDelBot*\n\nEjemplo:\n> setmenu Azura Infinity`
      }, { quoted: msg });
    }

    const stream = await downloadContentFromMessage(imageMsg, "image");
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const base64 = buffer.toString("base64");

    let data = fs.existsSync(setMenuPath)
      ? JSON.parse(fs.readFileSync(setMenuPath, "utf8"))
      : {};

    data[subbotID] = {
      nombre: text,
      imagen: base64
    };

    fs.writeFileSync(setMenuPath, JSON.stringify(data, null, 2));

    await conn.sendMessage(chatJid, {
      text: `✅ Menú personalizado guardado como:\n*${text}*\n📸 Imagen aplicada correctamente.`,
      quoted: msg
    });

    await conn.sendMessage(chatJid, {
      react: { text: "✅", key: msg.key }
    });

  } catch (e) {
    console.error("❌ Error en setmenu:", e);
    await conn.sendMessage(chatJid, {
      text: "❌ Ocurrió un error al guardar el menú personalizado.",
      quoted: msg
    });
  }
};

handler.command = ["setmenu"];
module.exports = handler;
