const data = require('../data.json');
const User = require('../models/users');
module.exports = {
  name: 'register',
  description: 'register cached users',
  aliases: ['registrar'],
  execute: async function (message, args, lang) {
    const { content, channel, guild, author, client } = message;
    if (author.id !== data.owner) return;
    for (const user of client.users.cache.values()) {
      if (!user.bot) {
        const foundU = await User.findOne({ userid: user.id });
        if (!foundU) {
          const newu = new User();
          newu.userid = user.id;
          newu.messages = 0;
          newu.avatar = user.displayAvatarURL({ dynamic: true });
          newu.tag = user.tag;
          await newu.save();
          console.log(`[!] Added ${user.tag}`);
        }
      }
    }
  },
};