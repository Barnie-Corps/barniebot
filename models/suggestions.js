const { Schema, model } = require("mongoose");
const SuggestSchema = new Schema({
    guildId: "",
    channelId: "",
    active: Boolean,
    suggestions: []
});
module.exports = model("suggestions", SuggestSchema);