const { Schema, model } = require("mongoose");
const SuggestSchema = new Schema({
    guildId: "",
    channelId: "",
    active: false,
    suggestions: []
});
module.exports = model("suggestions", SuggestSchema);