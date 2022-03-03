const { Schema, model } = require("mongoose");
const ContactFormSchema = new Schema({
  email: String,
  name: String,
  message: String,
  customId: String
});
module.exports = model("contact_forms", ContactFormSchema);