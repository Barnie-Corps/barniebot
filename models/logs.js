const { Schema, model } = require("mongoose");
const LogSchema = new Schema({
    guildid: "",
    lang: "",
    channelid: "",
    active: Boolean
});
module.exports = model("logs", LogSchema);