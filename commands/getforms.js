const Form = require('../models/contact_forms');
const Discord = require("discord.js");
const fs = require("fs-extra");
module.exports = {
  name: "getforms",
  description: null,
  aliases: [],
  tier: 0,
  clynet: {
    requiredRank: 3
  },
  execute: async function (message, args, lang, getInput) {
    const loading = message.client.cemojis.loading.emoji;
    async function reply(content) {
      return await message.reply(content).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    }
    let type = args[0] ? parseInt(args[0]) : null;
    if (!type) {
      const askmsg = await reply("Introduce el tipo de formato\n[1] Texto plano  [2] JSON");
      const response = await getInput();
      await response.delete();
      if (Number(response.content) !== 1 && Number(response.content) !== 2) return await askmsg.edit("El número de formato introducido es inválido");
      type = Number(response.content);
      await askmsg.delete();
    } else {
      if (type !== 1 && type !== 2) return reply("EL número de formato introducido es inválido.");
    }
    const waitmsg = await reply(loading);
    const forms = await Form.find();
    const paths = {
      json: "../forms.json",
      text: "../forms.txt"
    }
    if (type === 1) {
      const path = paths.text;
      fs.writeFileSync(path, "");
      fs.writeFileSync(path, forms.map(f => `Nombre: ${f.name}\n\nEmail: ${f.email}\n\nMensaje: ${f.message}`).join("\n\n----------------------\n\n"));
      await waitmsg.delete();
      await reply({ content: "Formularios de contacto", files: [path] });
    }
    else if (type === 2) {
      const path = paths.json;
      fs.writeFileSync(path, "");
      fs.writeFileSync(path, `
{
  ${forms.map(f => `
 {
  "Nombre": "${f.name}",
  "Email": "${f.email}",
  "Mensaje": "${f.message}"
 },
`).join("\n")}
}
`);
      await waitmsg.delete();
      await reply({ content: "Formularios de contacto", files: [path] });
    }
  }
}