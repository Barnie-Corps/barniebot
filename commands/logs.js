const { Message, MessageEmbed, TextChannel } = require("discord.js");
const Log = require("../models/logs");
module.exports = {
    name: "logs",
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
        const { author, member, channel, guild, client } = message;
        if (!member.permissions.has("MANAGE_GUILD")) return message.react(client.cemojis.no.emoji);
        const options = ["set", "off", "on"];
        lang = lang ? lang.lang : "es";
        const responses = {}
        /**
         * @param {number} length
         * @returns {string}
         */
        function createSpaces(length) {
            let char = "";
            for (let i = 0; i < length; i++) {
                char += " ";
            }
            return char;
        }
        /**
         * @param {number} length
         * @returns {string}
         */
        function createArrows(length) {
            let char = "";
            for (let i = 0; i < length; i++) {
                char += "^";
            }
            return char;
        }
        const option = args[0];
        if (!option) return message.reply("```\n" + `${client.prefix}logs {option} {args}\n${createSpaces(client.prefix.length)}      ^^^^^^\n\nERR: Missing Parameter` + "\n```");
        if (!options.some(o => o === option.toLowerCase())) return message.reply("```\n" + `${client.prefix}logs ${option} {args}\n${createSpaces(client.prefix.length)}     ${createArrows(option.length)}\n\nERR: Invalid Option` + "\n```");
        let foundG = await Log.findOne({ guildId: guild.id });
        if (!foundG) {
            foundG = new Log({ guildid: guild.id, active: true });
        }
        const langs = ["es", "en", "br"];
        switch (option.toLowerCase()) {
            case "set": {
                /**
                 * @type {TextChannel}
                 */
                let ch = message.mentions.channels.first();
                if (!ch) return message.reply("```\n" + `${client.prefix}logs set {channel}\n${createSpaces(client.prefix.length)}          ^^^^^^^\n\nERR: Missing Parameter` + "\n```");
                let lng = args[2];
                if (!lng) return message.reply("```\n" + `${client.prefix}logs set #${ch.name} {lang}\n${createSpaces(client.prefix.length)}          ${createSpaces(ch.name.length)}  ^^^^\n\nERR: Missing Parameter` + "\n```");
                if (!langs.some(l => l === lng.toLowerCase())) return message.reply("```\n" + `${client.prefix}logs set #${ch.name} ${lng}\n${createSpaces(client.prefix.length)}          ${createSpaces(ch.name.length)} ${createArrows(lng.length)}\n\nERR: Invalid Lang` + "\n```");
                foundG.lang = lng.toLowerCase();
                foundG.channelid = ch.id;
                await foundG.save();
                await message.react(client.cemojis.thumbup);
                break;
            }
            case "on": {
                if (foundG.active) return message.reply("```\n" + `${client.prefix}logs on\n${createSpaces(client.prefix.length)}     ^^\n\nERR: Logs already on` + "\n```");
                foundG.active = true;
                await foundG.save();
                break;
            }
            case "off": {
                if (!foundG.active) return message.reply("```\n" + `${client.prefix}logs off\n${createSpaces(client.prefix.length)}     ^^^\n\nERR: Logs already off` + "\n```");
                foundG.active = false;
                await foundG.save();
                break;
            }
        }
    }
}