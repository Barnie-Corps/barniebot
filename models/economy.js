const { Schema, model } = require('mongoose');
const EconomySchema = new Schema({
  userid: String,
  hand_money: Number,
  hand_item: String,
  bank: Number,
  items: Array,
  friends: Array,
  friend_requests: Array,
  rank: Number,
});
module.exports = model('economy', EconomySchema);