const { Schema, model } = require("mongoose");
const LogSchema = new Schema({
    guildid: String,
    lang: String,
    channeld: String,
    active: Boolean
});
module.exports = model("logs", LogSchema);