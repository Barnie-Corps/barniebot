const User = require('../models/users');
const { MessageEmbed } = require('discord.js');
module.exports = {
  name: 'top',
  description: 'Shows the messages top',
  aliases: ['messagestop', 'topmessages', 'top-messages', 'messages-top'],
  execute: async function(message, args, lang) {
    let msgmsg = 'mensajes';
    let topmsg = 'Top mensajes';
    if (lang !== null) {
      switch (lang.lang) {
        case "en":
        msgmsg = 'messages';
        topmsg = 'Top messages'
        break;
        case "br":
        msgmsg = 'mensagens';
        topmsg = 'Mensagens de topo';
        break;
      }
    }
    const loadingdc = message.client.cemojis.loading.emoji;
    const loadEmbed = new MessageEmbed()
    .setTitle(topmsg)
    .setDescription(`1- ${loadingdc}\n\n2- ${loadingdc}\n\n3- ${loadingdc}\n\n4- ${loadingdc}\n\n5- ${loadingdc}`)
    .setColor("PURPLE")
    .setTimestamp()
    const waitmsg = await message.reply({ embeds: [loadEmbed] });
    const users = await User.find();
    users.sort(function(a, b){
      return b.messages - a.messages
    });
    const newEmbed = new MessageEmbed()
    .setTitle(topmsg)
    .setDescription(`1 - ${users[0].tag} (\`${users[0].messages}\` ${msgmsg})\n\n2 - ${users[1].tag} (\`${users[1].messages}\` ${msgmsg})\n\n3 - ${users[2].tag} (\`${users[2].messages}\` ${msgmsg})\n\n4 - ${users[3].tag} (\`${users[3].messages}\` ${msgmsg})\n\n5 - ${users[4].tag} (\`${users[4].messages}\` ${msgmsg})`)
    .setColor("PURPLE")
    .setTimestamp()
    waitmsg.edit({ embeds: [newEmbed] });
  }
}