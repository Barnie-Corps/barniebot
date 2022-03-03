const { Message, User, MessageEmbed } = require("discord.js");
const wait = require("util").promisify(setTimeout);
module.exports = {
    name: "say",
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
        const { member, author, channel, guild, client, content } = message;
        const text = args.slice(0).join(" ");
        if (!text) return await message.react(client.cemojis.no.emoji);
        if (message.deletable) await message.delete();
        let totalCount = 0;
        for (const letter of text.trim().split("")) {
            totalCount += 400;
        }
        channel.sendTyping();
        if (totalCount > 30000) {
            totalCount = totalCount - 30000;
            await wait(10000);
            channel.sendTyping();
            await wait(10000);
            channel.sendTyping();
            await wait(10000);
            channel.sendTyping();
        }
        else if (totalCount > 20000) {
            totalCount = totalCount - 20000;
            await wait(10000);
            channel.sendTyping();
            await wait(10000);
            channel.sendTyping();
        }
        else if (totalCount > 10000) {
            totalCount = totalCount - 10000;
            await wait(10000);
            channel.sendTyping();
        }
        await wait(totalCount);
        channel.send({ content: text, allowedMentions: { parse: ["everyone", "users"] } });
    }
}