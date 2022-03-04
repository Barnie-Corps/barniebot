const { MessageEmbed, Message } = require("discord.js");
const Suggest = require("../models/suggestions");
module.exports = {
    name: "suggest",
    description: null,
    aliases: ["sugerir", "sugerencia"],
    tier: 0,
    /**
     * @param {Message} message
     * @param {string[]} args
     * @param {object} lang
     * @param {function} genString
     */
    execute: async function (message, args, lang, genString) {
        const { channel, author, member, guild, client } = message;
        const msg = args.slice(0).join(" ");
        const foundC = await Suggest.findOne({ guildId: guild.id });
        if (!foundC) return message.react(client.cemojis.no.emoji);
        if (!foundC.active) return message.react(client.cemojis.no.emoji);
        if (!msg) return message.react(client.cemojis.no.emoji);
        const ch = guild.channels.cache.get(foundC.channelId);
        const embed = new MessageEmbed()
        .setAuthor({ iconURL: author.displayAvatarURL({ dynamic: true }), name: `${member.nickname ? member.nickname : author.username} (${author.tag})` })
        .setColor("PURPLE")
        .setTitle("Suggestion")
        .setThumbnail(author.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setDescription(msg)
        const sug = await ch.send({ embeds: [embed] });
        await sug.react(client.cemojis.thumbup);
        await sug.react(client.cemojis.thumbup);
        await message.react(client.cemojis.thumbup);
    }
}