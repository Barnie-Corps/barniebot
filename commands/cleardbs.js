const data = require('../data.json');
const User = require('../models/users');
module.exports = {
  name: 'cleardb',
  description: '.',
  aliases: [],
  execute: async function(message, args, lang, genString) {
    const client = message.client;
    const users = await User.find();
    for (const user of users) {
      const u = await client.users.fetch(user.userid);
      if (u.bot || user.messages === 0) {
        await user.delete();
        console.log(`[!] Removed ${user.tag}`);
      }
    }
  }
}