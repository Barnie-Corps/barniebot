const { Schema, model } = require('mongoose');
const MsgSchema = new Schema({
  count: Number
});
module.exports = model('messageCount', MsgSchema);