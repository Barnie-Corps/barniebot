const { Schema, model } = require('mongoose');
const PatreonSchema = new Schema({
  userid: String,
  tier: Number
});
module.exports = model('patreons', PatreonSchema);