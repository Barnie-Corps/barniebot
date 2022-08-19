const { Schema, model } = require('mongoose');
const TimeSchema = new Schema({
  userid: String,
  started: Number,
  active: Boolean,
  type: String,
  total: Number,
  finished: Number
});
module.exports = model("temps", TimeSchema);