const { Message, MessageEmbed } = require("discord.js");
const Suggest = require("../models/suggestions");
module.exports = {
    name: "setsuggest",
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
        const { member, author, client, channel, guild } = message;
        if (!member.permissions.has("MANAGE_GUILD")) return message.react(client.cemojis.no.emoji);
        let nochannel = "Debes mencionar el canal en el que deseas establecer las sugerencias";
        let alreadyChannel = "Ese canal ya ha sido establecido como el canal de sugerencias";
        let cannotSend = "No puedo enviar mensajes a ese canal";
        let doneWithoutLast = "Canal establecido de manera exitosa";
        if (lang) {
            switch (lang.lang) {
                case "en": {
                    nochannel = "You must mention the channel where u want to set the suggestions";
                    alreadyChannel = "This channel has already been established as the suggestion channel";
                    cannotSend = "I cannot send messages to that channel";
                    doneWithoutLast = "Channel successfully set";
                    break;
                }
                case "br": {
                    nochannel = "Você deve mencionar o canal no qual você deseja montar as sugestões";
                    alreadyChannel = "Esse canal já foi estabelecido como o canal de sugestão";
                    cannotSend = "Eu não posso enviar mensagens para esse canal";
                    doneWithoutLast = "Canal estabelecido com sucesso";
                    break;
                }
            }
        }
        function genDoneWithLast(lng, last, current) {
            let msg = "";
            switch (lng) {
                case "es": {
                    msg = `El canal ha sido cambiado de <#${last}> a <#${current}>`;
                    break;
                }
                case "en": {
                    msg = `The channel was changed from <#${last}> to <#${current}>`;
                    break;
                }
                case "br": {
                    msg = `O canal foi mudado de <#${last}> para <#${current}>`;
                    break;
                }
            }
            return msg;
        }
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply(nochannel);
        let suggest = await Suggest.findOne({ guildId: guild.id });
        if (suggest) {
            if (suggest.channelId === ch.id) return message.reply(alreadyChannel);
        }
        else {
            suggest = new Suggest({ guildId: guild.id, active: true });
        }
        const lastCh = suggest.channelId !== "" ? `<#${suggest.channelId}>` : null;
        suggest.channelId = ch.id;
        await suggest.save();
        if (!lastCh) {
            message.reply(doneWithoutLast);
        }
        else message.reply(genDoneWithLast(lang ? lang.lang : "es", lastCh, ch.id));
    }
}