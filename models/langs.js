const { Schema, model } = require('mongoose');
const LangSchema = new Schema({
  userid: String,
  lang: String,
});
module.exports = model('langs', LangSchema);