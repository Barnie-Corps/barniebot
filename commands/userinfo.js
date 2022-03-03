const User = require('../models/users');
const { MessageEmbed } = require('discord.js');
module.exports = {
  name: 'userinfo',
  description: 'See your public info',
  aliases: ['user', 'infouser'],
  execute: async function(message, args, lang) {
    let member = message.mentions.users.first() ? message.mentions.users.first().id : message.author.id
    const foundU = await User.findOne({ userid: member });
    member = await message.guild.members.fetch(member);
    const author = message.author;
    const newEmbed = new MessageEmbed()
    .setTitle(member.user.username)
    .addField(`Username`, member.user.username, true)
    .addField('Tag', member.user.tag, true)
    .addField('Created', `${member.user.createdAt.toString()}`, true)
    .addField('Nickname', member.nickname ? member.nickname : 'no nickname', true)
    .addField('Joined at', member.joinedAt.toString(), true)
    .addField('Messages', foundU ? foundU.messages.toString() : '0', true)
    .setColor("PURPLE")
    .setTimestamp()
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    message.reply({ embeds: [newEmbed] }).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
  }
}