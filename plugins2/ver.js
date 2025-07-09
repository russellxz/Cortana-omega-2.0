const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const handler = async (msg, { conn }) => {
  try {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      return await conn.sendMessage(msg.key.remoteJid, {
        text: "❌ *Error:* Debes responder a una imagen, video o nota de voz para reenviarla."
      }, { quoted: msg });
    }

    const unwrap = m => {
      let node = m;
      while (
        node?.viewOnceMessage?.message ||
        node?.viewOnceMessageV2?.message ||
        node?.viewOnceMessageV2Extension?.message ||
        node?.ephemeralMessage?.message
      ) {
        node =
          node.viewOnceMessage?.message ||
          node.viewOnceMessageV2?.message ||
          node.viewOnceMessageV2Extension?.message ||
          node.ephemeralMessage?.message;
      }
      return node;
    };

    const inner = unwrap(quoted);

    let mediaType, mediaMsg;
    if (inner.imageMessage) {
      mediaType = "image"; mediaMsg = inner.imageMessage;
    } else if (inner.videoMessage) {
      mediaType = "video"; mediaMsg = inner.videoMessage;
    } else if (inner.audioMessage || inner.voiceMessage || inner.pttMessage) {
      mediaType = "audio";
      mediaMsg = inner.audioMessage || inner.voiceMessage || inner.pttMessage;
    } else {
      return await conn.sendMessage(msg.key.remoteJid, {
        text: "❌ *Error:* El mensaje citado no contiene un archivo compatible."
      }, { quoted: msg });
    }

    await conn.sendMessage(msg.key.remoteJid, {
      react: { text: "⏳", key: msg.key }
    });

    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buf = Buffer.alloc(0);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

    const credit = "> 🔓 Recuperado por:\n`CORTANA 2.0 BOT`";
    const opts = { mimetype: mediaMsg.mimetype };

    if (mediaType === "image") {
      opts.image = buf;
      opts.caption = credit;
    } else if (mediaType === "video") {
      opts.video = buf;
      opts.caption = credit;
    } else {
      opts.audio = buf;
      opts.ptt = mediaMsg.ptt ?? true;
      if (mediaMsg.seconds) opts.seconds = mediaMsg.seconds;
    }

    await conn.sendMessage(msg.key.remoteJid, opts, { quoted: msg });

    if (mediaType === "audio") {
      await conn.sendMessage(msg.key.remoteJid, {
        text: credit
      }, { quoted: msg });
    }

    await conn.sendMessage(msg.key.remoteJid, {
      react: { text: "✅", key: msg.key }
    });

  } catch (err) {
    console.error("❌ Error en comando ver:", err);
    await conn.sendMessage(msg.key.remoteJid, {
      text: "❌ *Error:* Hubo un problema al procesar el archivo."
    }, { quoted: msg });
  }
};

handler.command = ["ver"];
module.exports = handler;
