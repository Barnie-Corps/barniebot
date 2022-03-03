const data = require('../data.json');
const User = require('../models/users');
module.exports = {
  name: 'updatedb',
  description: null,
  aliases: [],
  execute: async function(message, args, lang, genString) {
    if (message.author.id !== data.owner) return;
    const { author, channel, guild, member, client } = message;
    const users = await User.find();
    for (const user of users) {
      const u = await client.users.fetch(user.userid);
      if (u.displayAvatarURL({ dynamic: true }) !== user.avatar || u.tag !== user.tag) {
      user.avatar = u.displayAvatarURL({ dynamic: true });
      user.tag = u.tag;
      await user.save();
      console.log(`[!] Updated ${u.tag}`);
      }
    }
  }
}