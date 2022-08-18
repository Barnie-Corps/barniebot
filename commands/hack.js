const { Message, User, MessageEmbed } = require("discord.js");
const Prefix = require("../models/prefixes");
const wait = require("util").promisify(setTimeout);
module.exports = {
    name: 'hack',
    description: '.',
    aliases: [],
    tier: 0,
    /**
     * @param {Message} message
     * @param {string[]} args
     * @param {object} lang
     * @param {function} genString
     */
    execute: async function (message, args, lang) {
        const { client, channel, guild, author, member } = message;
        function createArrows(length) {
            let arrows = "";
            for (let i = 0; i < length; i++) {
                arrows += "^";
            }
            return arrows;
        }
        function createSpaces(length) {
            let spaces = "";
            for (let i = 0; i < length; i++) {
                spaces += " ";
            }
            return spaces;
        }
        let target = message.mentions.users.first() ?? args[0];
        let prefix = await Prefix.findOne({ guildid: guild.id });
        if (!prefix) prefix = "b.";
        else prefix = prefix.prefix;
        if (!target) {
            return message.reply("```\n" + `${prefix}hack <User>\n${createSpaces(`${prefix}hack <`.length)}${createArrows("User".length)}\n\nERR: Missing parameter` + "\n```");
        }
        if (target instanceof User) {
            if (target.id === author.id) {
                return message.reply("```\n" + `${prefix}hack <User>\n${createSpaces(`${prefix}hack <`.length)}${createArrows("User".length)}\n\nERR: Invalid user provided` + "\n```");
            }
        }
        else if (typeof target === "string") {
            if (!isNaN(target)) {
                let validUser = false;
                try {
                    target = await client.users.fetch(target);
                    validUser = true;
                }
                catch (err) {
                    validUser = false;
                }
                if (!validUser) {
                    return message.reply("```\n" + `${prefix}hack <User>\n${createSpaces(`${prefix}hack <`.length)}${createArrows("User".length)}\n\nERR: Invalid user provided` + "\n");
                }
            }
            else {
                target = guild.members.cache.find(m => {
                    if (m.nickname && m.nickname.toLowerCase() === target.toLowerCase() || m.nickname && m.nickname.toLowerCase().includes(target.toLowerCase())) {
                        return true;
                    }
                    else if (m.user.username.toLowerCase() === target.toLowerCase() || m.user.username.toLowerCase().includes(target.toLowerCase())) {
                        return true;
                    }
                    else return false;
                });
                if (!target) {
                    return message.reply("```\n" + `${prefix}hack <User>\n${createSpaces(`${prefix}hack <`.length)}${createArrows("User".length)}\n\nERR: Invalid user provided` + "\n");
                }
            }
        }
        const createFakeIp = () => {
            let ip = "";
            for (let i = 0; i < 4; i++) {
                ip += Math.floor(Math.random() * 255) + ".";
            }
            return ip.substring(0, ip.length - 1);
        }
        const fakeCoordinates = () => {
            let coordinates = "";
            for (let i = 0; i < 3; i++) {
                coordinates += Math.floor(Math.random() * 100) + ",";
            }
            return coordinates.substring(0, coordinates.length - 1);
        }
        const hackmsg = await channel.send("Loading...");
        await wait(2000);
        await hackmsg.edit(`Hacking ${target}...`);
        await wait(3000);
        await hackmsg.edit("Searching for IP address...");
        await wait(3000);
        await hackmsg.edit(`Found IP address: ${createFakeIp()}`);
        await wait(2000);
        await hackmsg.edit("Searching for location...");
        await wait(3000);
        await hackmsg.edit(`Found location: ${fakeCoordinates()}`);
        await wait(2000);
        await hackmsg.edit("Injecting trojan...");
        await wait(3000);
        await hackmsg.edit("Trojan injected, starting attack...");
        await wait(2000);
        await hackmsg.edit("attack started, waiting for results...");
        await wait(3000);
        await hackmsg.edit("Attack complete, scanning results...");
        await wait(3000);
        await hackmsg.edit("Scan complete, loading results...");
        await wait(3000);
        await hackmsg.edit("Results loaded and sent to the Deep Web, finishing up...");
        await wait(2000);
        await hackmsg.delete();
        await channel.send("The *totally legit* hack has been completed successfully!");
    }
}