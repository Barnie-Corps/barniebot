const { Message, User, MessageEmbed } = require("discord.js");
module.exports = {
    name: "avatar",
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
        let nfound = "No encontré ningún usuario con esa ID";
        let nocoinc = "No encontré ninguna coincidencia en apodo o nombre de usuario";
        if (lang) {
            switch (lang.lang) {
                case "en": {
                    nfound = "I did not find any user with that ID";
                    nocoinc = "I did not find any match on nickname or username";
                }
                case "br": {
                    nfound = "Eu não encontrei nenhum usuário com essa ID";
                    nocoinc = "Não encontrei nenhuma correspondência no nickname ou nome de usuário";
                }
            }
        }
        let target = message.mentions.users.size > 0 ? message.mentions.users.first() : args[0];
        if (!target) target = author;
        let embed = new MessageEmbed()
        embed.setColor("PURPLE");
        embed.setTimestamp();
        if (target instanceof User === true) {
            embed.setTitle(target.tag);
            embed.setImage(target.displayAvatarURL({ dynamic: true, size: 1024 }));
        }
        else if (typeof target === "string") {
            if (!isNaN(target)) {
                await client.users.fetch(target).catch(console.log);
                if (!client.users.cache.has(target)) return message.reply(nfound);
                target = client.users.cache.get(target);
                embed.setTitle(target.tag);
                embed.setImage(target.displayAvatarURL({ dynamic: true, size: 1024 }));
            }
            else {
                const foundM = guild.members.cache.find(m => {
                    if (m.nickname) {
                        if (m.nickname.toLowerCase().includes(target.toLowerCase()) || m.nickname.toLowerCase() === target.toLowerCase()) return true;
                    }
                    else {
                        if (m.user.username.toLowerCase() === target.toLowerCase() || m.user.username.toLowerCase().includes(target.toLowerCase())) return true;
                        else return false;
                    }
                });
                if (!foundM) return message.reply(nocoinc);
                target = foundM.user;
                embed.setTitle(target.tag);
                embed.setImage(target.displayAvatarURL({ dynamic: true, size: 1024 }));
            }
        }
        message.reply({ embeds: [embed] });
    }
}