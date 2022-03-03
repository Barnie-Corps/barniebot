const { Schema, model } = require('mongoose');
const UserSchema = new Schema({
  userid: String,
  messages: Number,
  tag: String,
  avatar: String
});
module.exports = model('total_users', UserSchema);