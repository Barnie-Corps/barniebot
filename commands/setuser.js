const Roleu = require('../models/roleuser');
const Discord = require('discord.js');
module.exports = {
  name: "setuser",
  description: null,
  aliases: ["setruser", "setroleuser", "setroleplayuser"],
  tier: 1,
  execute: async function(message, args, lang) {
    const { author, client, guild, channel } = message;
    const loadingdc = client.cemojis.loading;
    async function reply(content) {
      return await message.reply(content).catch(err => channel.send(`An error ocurred while replying\n\`${err}\``));
    }
    let waitmsg = await reply(loadingdc.emoji);
    const foundR = await Roleu.findOne({ userid: message.author.id });
    let alrf = "Ya cuentas con un personaje, ¿Deseas editarlo?";
    let acceptText = "Aceptar";
    let refuseText = "Cancelar";
    let asked = "¿Qué deseas actualizar?";
    let opt1 = "Nombre";
    let opt2 = "Avatar";
    let opt3 = "Ambos";
    if (lang !== null) {
      switch (lang.lang) {
        case "en":
        alrf = "You already have a character, do you want to edit it?";
        acceptText = "Accept";
        refuseText = "Cancel";
        asked = "What do you want to update?";
        opt1 = "Name";
        opt2 = "Avatar";
        opt3 = "Both";
        break;
        case "br":
        alrf = "Você já tem um personagem, você quer editá-lo?";
        acceptText = "Aceitar";
        refuseText = "Cancelar";
        asked = "O que você deseja atualizar?";
        opt1 = "Nome";
        opt2 = "Avatar";
        opt3 = "Ambos";
        break;
      }
    }
    const row1 = new Discord.MessageActionRow()
    .addComponents(
      new Discord.MessageButton()
      .setCustomId("accept_edit")
      .setLabel(acceptText)
      .setStyle("SUCCESS"),
      new Discord.MessageButton()
      .setCustomId("cancel_edit")
      .setLabel(refuseText)
      .setStyle("DANGER")
    );
    const row2 = new Discord.MessageActionRow()
    .addComponents(
      new Discord.MessageButton()
      .setCustomId("opt1_edit")
      .setLabel(opt1)
      .setStyle("PRIMARY"),
      new Discord.MessageButton()
      .setCustomId("opt2_edit")
      .setLabel(opt2)
      .setStyle("PRIMARY"),
      new Discord.MessageButton()
      .setCustomId("opt3_edit")
      .setLabel(opt3)
      .setStyle("PRIMARY")
    );
    async function getInput(authorId) {
      const filt = m => m.author.id === authorId;
      const collected = await channel.awaitMessages({ filter: filt, max: 1 });
      return collected.first();
    }
    const filter = (int) => true;
    const collector = waitmsg.createMessageComponentCollector({ filter: filter });
    collector.on("collect", async interaction => {
      if (interaction.isButton()) {
        if (interaction.customId === "accept_edit") {
          await interaction.deferUpdate();
          waitmsg.edit({ content: asked, components: [row2] });
        }
        else if (interaction.customId === "cancel_edit") {
          await interaction.deferUpdate();
          waitmsg.edit()
        }
      }
    })
    if (foundR) {
      waitmsg.edit({ content: alrf, components: [row1] });
    }
  }
}