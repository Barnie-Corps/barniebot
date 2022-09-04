import { EmbedBuilder, Guild, GuildMember, Message, User } from "discord.js";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";

export default {
    data: {
        name: "avatar",
        aliases: [],
        description: "Muestra el avatar de un usuario específico o de quien ejecuta el comando.",
        guildOnly: false,
        requiredGuildPermissions: [],
        category: "utility"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        let target = message.mentions.users.first() ?? args[0];
        if (!target) target = message.author;
        const embed = new EmbedBuilder()
        embed.setAuthor({ iconURL: message.author.displayAvatarURL(), name: message.author.tag });
        if (target instanceof User) {
            embed.setImage(target.displayAvatarURL({ size: 1024 }))
            .setTitle(message.guild ? (message.guild.members.cache.get(target.id)?.nickname ?? target.username) + ` (${target.tag})` : target.tag);
        }
        else if (typeof target === "string") {
            if (!isNaN(target as any)) {
                let userExists = false;
                try {
                    await message.client.users.fetch(target);
                    userExists = true;
                }
                catch (err: any) {
                    return await reply("```\n" + `${prefix}avatar ${target}\n${utils.createSpaces(`${prefix}avatar `.length)}${utils.createArrows(target.length)}\n\nERR: Invalid ID provided.` + "\n```");
                }
                target = await message.client.users.fetch(target);
                embed.setImage(target.displayAvatarURL({ size: 1024 }))
                .setTitle(message.guild ? (message.guild.members.cache.get(target.id)?.nickname ?? target.username) + ` (${target.tag})` : target.tag);
            }
            else {
                if (message.guild) {
                    const foundTarget = message.guild.members.cache.find((m): boolean => {
                        if (m.nickname && m.nickname.toLowerCase() === (target as string).toLowerCase() || m.nickname && m.nickname.toLowerCase().includes((target as string).toLowerCase())) return true;
                        else if (m.user.username.toLowerCase() === (target as string).toLowerCase() || m.user.username.toLowerCase().includes((target as string).toLowerCase())) return true;
                        else return false;
                    });
                    if (!foundTarget) return await reply("```\n" + `${prefix}avatar ${target}\n${utils.createSpaces(`${prefix}avatar `.length)}${utils.createArrows(target.length)}\n\nERR: Invalid nickname/username provided.` + "\n```");
                    else {
                        embed.setImage(foundTarget.displayAvatarURL({ size: 1024 }))
                        .setTitle(message.guild ? (message.guild.members.cache.get(foundTarget.user.id)?.nickname ?? foundTarget.user.username) + ` (${foundTarget.user.tag})` : foundTarget.user.tag);
                    }
                }
                else {
                    const foundTarget = message.client.users.cache.find(u => u.username.toLowerCase() === (target as string).toLowerCase() || u.username.toLowerCase().includes((target as string).toLowerCase()));
                    if (!foundTarget) return await reply("```\n" + `${prefix}avatar ${target}\n${utils.createSpaces(`${prefix}avatar `.length)}${utils.createArrows(target.length)}\n\nERR: Invalid username provided.` + "\n```");
                    else {
                        embed.setImage((foundTarget as User).displayAvatarURL({ size: 1024 }))
                        .setTitle(message.guild ? ((message.guild as Guild).members.cache.get((foundTarget as User).id)?.nickname ?? foundTarget.username) + ` (${(foundTarget as User).tag})` : (foundTarget as User).tag);
                    }
                }
            }
        }
        embed.setColor("Purple")
        embed.setTimestamp()
        await reply({ embeds: [embed] } as unknown as string);
    }
}