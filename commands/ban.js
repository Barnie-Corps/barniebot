const { Message, User, MessageEmbed, GuildMember } = require("discord.js");
module.exports = {
    name: "ban",
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
        const noEmoji = client.cemojis.no;
        let target = message.mentions.members.first() ?? args[0];
        if (!member.permissions.has("BAN_MEMBERS")) return message.react(noEmoji.emoji);
        if (!target) return message.react(noEmoji.emoji);
        if (target instanceof GuildMember) {
            if (!target.bannable) return message.reply("ERR: Target Not Bannable");
            target.ban({ days: 7, reason: `Ban requested by ${author.tag}` });
            message.react(client.cemojis.thumbup);
        }
        else {
            if (isNaN(target)) return message.react(client.cemojis.no.emoji);
            await client.users.fetch(target);
            if (!guild.members.cache.has(target)) return message.react(noEmoji.emoji);
            guild.members.cache.get(target).ban({ days: 7, reason: `Ban requested by ${author.tag}` });
            message.react(client.cemojis.thumbup);
        }
    }
}