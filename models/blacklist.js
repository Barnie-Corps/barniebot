const { Schema, model } = require('mongoose');
const BlackSchema = new Schema({
  userid: String,
  blocked: Boolean
});
module.exports = model("blacklist", BlackSchema);