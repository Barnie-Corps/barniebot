import { ButtonBuilder } from "@discordjs/builders";
import { ActionRowBuilder, ButtonStyle, EmbedBuilder, Message } from "discord.js";
import data from "../data";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";

export default {
    data: {
        name: "command",
        aliases: ["comando", "commandinfo"],
        description: "Este comando sirve para ver información específica de un comando.",
        guildOnly: false,
        requiredGuildPermissions: [],
        category: "info"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        let command = args[0];
        if (!command) return reply("```\n" + `${prefix}command <command>\n${utils.createSpaces(`${prefix}command <`.length)}${utils.createArrows("command".length)}\n\nERR: Missing required argument.` + "\n```");
        command = command.toLowerCase();
        const foundCommand = data.bot.commands.get(command) ?? data.bot.commands.find(c => c.data.aliases.includes(command));
        if (!foundCommand) return reply("```\n" + `${prefix}${command}\n${utils.createSpaces(prefix.length)}${utils.createArrows((command as string).length)}\n\nERR: Unknown command.` + "\n```");
        const texts = {
            embed: {
                title: `Información del comando ${foundCommand.data.name}`,
                description: foundCommand.data.description,
                footer: "Santiago Morales © 2020 - 2025 All rights reserved.",
                empty: "Oops... este lugar parece vacío"
            },
            fields: {
                aliases: "Aliases"
            }
        }
        await utils.parallel({
            embed: async (callback: any) => {
                if (lang !== "es") {
                    texts.embed.title = (await utils.translate(texts.embed.title, "es", lang)).text;
                    texts.embed.description = (await utils.translate(texts.embed.description, "es", lang)).text;
                    texts.embed.empty = (await utils.translate(texts.embed.empty, "es", lang)).text;
                }
                callback(null, true);
            }
        });
        const embed = new EmbedBuilder()
        .setAuthor({ iconURL: message.author.displayAvatarURL(), name: message.author.tag })
        .setTitle(texts.embed.title)
        .setDescription(texts.embed.description)
        .addFields(
            {
                name: texts.fields.aliases,
                value: foundCommand.data.aliases.length > 0 ? `${foundCommand.data.aliases.map((c: any) => c).join(", ")}.` : texts.embed.empty
            }
        )
        .setColor("Purple")
        .setFooter({ text: texts.embed.footer })
        .setTimestamp()
        const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId(`execute-command-${foundCommand.data.name}-${message.author.id}`)
            .setLabel("Execute")
            .setStyle(ButtonStyle.Primary)
        )
        await reply({ embeds: [embed], components: [row] } as unknown as string);
    }
}