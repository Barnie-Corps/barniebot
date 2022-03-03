const { Schema, model } = require('mongoose');
const TimeSchema = new Schema({
  userid: String,
  left: Number,
  active: Boolean,
  type: String,
  total: Number
});
module.exports = model("temps", TimeSchema);