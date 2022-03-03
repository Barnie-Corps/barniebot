const { Schema, model } = require('mongoose');
const NoticeSchema = new Schema({
  guildid: String,
  channelid: String,
  active: Boolean
});
module.exports = model('notices', NoticeSchema);