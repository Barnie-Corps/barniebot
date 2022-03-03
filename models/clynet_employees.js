const { Schema, model } = require("mongoose");
const ClynetEmployeeSchema = new Schema({
  name: String,
  rankString: String,
  rankLevel: Number,
  document: String,
  documentType: String,
  discordID: String
});
module.exports = model("clynet_employees", ClynetEmployeeSchema);