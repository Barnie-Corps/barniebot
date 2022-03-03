const { Schema, model } = require('mongoose');
const FilterSchema = new Schema({
  guildid: String,
  words: Array,
  rolwhite: Array,
  memwhite: Array,
  channelwhite: Array,
  message: String,
  active: Boolean,
  guild_token: String,
});
module.exports = model('filters', FilterSchema);