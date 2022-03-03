const { Schema, model } = require('mongoose');
const WarnSchema = new Schema({
  guildid: String,
  userid: String,
  warns: Array
});
module.exports = model('warns', WarnSchema);