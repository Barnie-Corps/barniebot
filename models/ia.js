const { Schema, model } = require('mongoose');
const AiSchema = new Schema({
  userid: String,
  channelid: String,
  active: Boolean
});
module.exports = model('ia', AiSchema);