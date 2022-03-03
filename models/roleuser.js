const { Schema, model } = require('mongoose');
const RoleUserSchema = new Schema({
  userid: String,
  username: String,
  avatar: String
});
module.exports = model("roleplay_users", RoleUserSchema);