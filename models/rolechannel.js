const { Schema, model } = require('mongoose');
const RolechannelSchema = new Schema({
  guildid: String,
  chanelid: String,
  active: Boolean
});
module.exports = model("roleplay_channels", RolechannelSchema);