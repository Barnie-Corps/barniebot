const { Schema, model } = require('mongoose');
const CmdSchema = new Schema({
  guildid: String,
  triggerer: String,
  response: String
});
module.exports = model('customcmds', CmdSchema);