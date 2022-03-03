const data = require('../data.json');
const Msg = require('../models/messages');
const User = require('../models/users');
module.exports = {
  name: 'storemsgs',
  description: null,
  aliases: [],
  execute: async function(message, args, lang, genString) {
    if (message.author.id !== data.owner) return;
    const waitmsg = await message.reply('Wait...');
    const msgs = await Msg.find();
    const users = await User.find();
    let totalmsg = 0;
    await users.forEach(u => {
      totalmsg += u.messages;
    });
    if (msgs.length < 1) {
      const newMsg = new Msg();
      newMsg.count = totalmsg;
      await newMsg.save();
      await waitmsg.edit('Done');
    } else {
      msgs[0].count = totalmsg;
      await msgs[0].save();
      await waitmsg.edit('Done');
    }
  }
}