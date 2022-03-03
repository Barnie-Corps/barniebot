const { Message, User, MessageEmbed } = require("discord.js");
const wait = require("util").promisify(setTimeout);
module.exports = {
    name: "clear",
    description: null,
    aliases: [],
    tier: 0,
    /**
     * @param {Message} message
     * @param {string[]} args
     * @param {object} lang
     * @param {function} genString
     */
    execute: async function (message, args, lang, genString) {
        const { member, author, guild, client, content } = message;
        if (!member.permissions.has("MANAGE_MESSAGES")) return message.react(client.cemojis.no.emoji);
        let ammount = args[0] ? args[0] : 100;
        if (typeof ammount === "string") {
            if (isNaN(ammount)) return message.react(client.cemojis.no.emoji);
            if (!Number.isInteger(Number(ammount))) return message.react(client.cemojis.no.emoji);
            ammount = Number(ammount);
        }
        if (ammount > 100) ammount = 100;
        await message.delete();
        const deleted = await message.channel.bulkDelete(ammount).catch(err => {
            if (err.message.includes("You can only bulk delete messages that are under 14 days old.")) {
                message.channel.send(`ERR: ${err.message}`);
            }
            else {
                message.channel.send(`ERR: ${err.message}`);
            }
        });
        await message.channel.send(`Deleted ${deleted.size} messages`);
    }
}