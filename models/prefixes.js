const { Schema, model } = require('mongoose');
const PrefixSchema = new Schema({
	guildid: String,
	prefix: String,
});
module.exports = model('prefixes', PrefixSchema);