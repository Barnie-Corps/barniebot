const { Schema, model } = require('mongoose');
const ChatSchema = new Schema({
  guildid: String,
  channelid: String,
  webhookToken: String,
  webhookId: String,
  active: Boolean
});
module.exports = model('chats', ChatSchema);