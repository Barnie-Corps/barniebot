const { Schema, model } = require("mongoose");
const LogSchema = new Schema({
    guildid: "",
    lang: "",
    channeld: "",
    active: Boolean
});
module.exports = model("logs", LogSchema);