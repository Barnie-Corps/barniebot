import { ButtonBuilder } from "@discordjs/builders";
import { ActionRowBuilder, EmbedBuilder, Message, SelectMenuBuilder, SelectMenuOptionBuilder } from "discord.js";
import data from "../data";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";

export default {
    data: {
        name: "commands",
        aliases: ["comandos"],
        description: "Muestra una lista de los comandos disponibles.",
        guildOnly: false,
        requiredGuildPermissions: [],
        category: "info"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const texts = {
            embed: {
                title: "Comandos de BarnieBot",
                description: "Utiliza el menú de abajo para navegar por las diferentes categorías.",
                footer: "Santiago Morales © 2020 - 2025 All rights reserved."
            },
            categories: {
                info: "Información",
                mod: "Moderación",
                config: "Configuración",
                fun: "Diversión",
                support: "Soporte",
                logs: "Logísitca",
                utility: "Utilidad",
                placeholder: "Selecciona una opción..."
            }
        }
        await utils.parallel({
            embed: async (callback: any) => {
                if (lang !== "es") {
                    texts.embed.title = (await utils.translate(texts.embed.title, "es", lang)).text;
                    texts.embed.description = (await utils.translate(texts.embed.description, "es", lang)).text;
                }
                callback(null, true);
            },
            categories: async (callback: any) => {
                if (lang !== "es") {
                    for (const [key, value] of Object.entries(texts.categories)) {
                        (texts.categories as any)[`${key}`] = (await utils.translate(value, "es", lang)).text;
                    }
                }
                callback(null, true);
            }
        });
        const row = new ActionRowBuilder()
        .addComponents(
            new SelectMenuBuilder()
            .setCustomId(`commands-${message.author.id}`)
            .setPlaceholder(texts.categories.placeholder)
            .setOptions(
                {
                    label: texts.categories.info,
                    value: "info_category"
                },
                {
                    label: texts.categories.utility,
                    value: "utility_category"
                },
                {
                    label: texts.categories.mod,
                    value: "mod_category"
                },
                {
                    label: texts.categories.fun,
                    value: "fun_category"
                },
                {
                    label: texts.categories.config,
                    value: "config_category"
                },
                {
                    label: texts.categories.support,
                    value: "support_category"
                }
            )
        );
        const embed = new EmbedBuilder()
        .setAuthor({ iconURL: message.author.displayAvatarURL(), name: message.author.tag })
        .setTitle(texts.embed.title)
        .setDescription(texts.embed.description)
        .setFooter({ text: texts.embed.footer })
        .setTimestamp()
        .setColor("Purple")
        await reply({ embeds: [embed], components: [row] } as unknown as string);
    }
}