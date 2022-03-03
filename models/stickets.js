const { Schema, model } = require('mongoose');
const TicketSchema = new Schema({
  openerid: String,
  reason: String,
  id: String,
  closed: Boolean
});
module.exports = model("support_tickets", TicketSchema);