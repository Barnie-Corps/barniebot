const { Schema, model } = require("mongoose");
const SuggestSchema = new Schema({
    guildId: "",
    channelId: "",
    active: true,
    suggestions: []
});
module.exports = model("suggestions", SuggestSchema);