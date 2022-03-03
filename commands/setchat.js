const Chat = require('../models/chat');
const Discord = require('discord.js');
module.exports = {
  name: 'setchat',
  description: 'Sets the global chat',
  aliases: ['setglobalchat', 'setglobalmessages', 'setglobal'],
  execute: async function(message, args, lang) {
    async function reply(content) {
      return await message.reply(content).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    }
    if (!message.member.permissions.has("MANAGE_GUILD")) return message.react("❌");
    let donemsg = 'Canal establecido con éxito.\n`Nota: El chat global puede tardar un tiempo en iniciarse correctamente una vez establecido el canal.`';
    let yamsg = 'El canal ya ha sido establecido para el chat global, si aún no llegan los mensajes ni se envian espera un rato!';
    if (lang !== null){
      switch (lang.lang) {
        case "en":
        donemsg = 'Channel successfully established.\n`Note: The global chat may take some time to start properly once the channel is established.`';
        yamsg = 'The channel has already been established for the global chat, if messages are still not arriving or being sent, wait a while!';
        break;
        case "br":
        donemsg = 'Canal estabelecido com sucesso.\n`Nota: Pode levar algum tempo para que o bate-papo global comece corretamente uma vez que o canal esteja estabelecido.`';
        yamsg = 'O canal já foi criado para o bate-papo global, se as mensagens ainda não estão chegando ou sendo enviadas, espere um pouco!';
        break;
      }
    }
    let targetChannel = message.mentions.channels.first() ? message.mentions.channels.first().id : message.channel.id;
    targetChannel = await message.client.channels.fetch(targetChannel);
    const foundCh = await Chat.findOne({ guildid: message.guild.id });
    const webh = await targetChannel.createWebhook('chat', {
      avatar: 'https://xerobot.xyz/images/default_avatar.png'
    });
    if (!foundCh) {
      const newch = new Chat();
      newch.guildid = message.guild.id;
      newch.channelid = targetChannel.id;
      newch.webhookToken = webh.token;
      newch.webhookId = webh.id;
      newch.active = true;
      await newch.save();
      reply(donemsg);
      message.client.channels.cache.get("789294581333884948").send(`Nueva solicitud de chat global.`);
    } else {
      if (foundCh.channelid === targetChannel.id) return reply(yamsg);
      const hook = new Discord.WebhookClient({ id: foundCh.webhookId, token: foundCh.webhookToken });
      try {
      await hook.delete();
      }
      catch (err) {
        console.log(err);
      }
      foundCh.channelid = targetChannel.id;
      foundCh.webhookToken = webh.token;
      foundCh.webhookId = webh.id;
      foundCh.active = true;
      await foundCh.save();
      reply(donemsg);
      message.client.channels.cache.get("789294581333884948").send(`Nueva solicitud de chat global.`);
    }
  }
}