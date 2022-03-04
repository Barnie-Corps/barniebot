const { Message, MessageEmbed } = require("discord.js");
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
        const responses = {
            invalidOption: {
                es: "La opción introducida es inválida",
                en: "The entered option is invalid",
                br: "A opção inserida é inválida"
            }
        }
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
        if (!option) return message.reply("```\n" + `${client.prefix}logs {option} {args}\n${createSpaces(client.prefix.length)}      ^^^^^^\n\nERR: Missing parameter` + "\n```");
        if (!options.some(o => o === option.toLowerCase())) return message.reply("```\n" + `${client.prefix}logs ${option} {args}\n${createSpaces(client.prefix.length)}     ${createArrows(option.length)}\n\nERR: Invalid Option` + "\n```");
    }
}