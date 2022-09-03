import { EmbedBuilder, Message } from "discord.js";
import { ReplyFunction } from "../types/interfaces";
import * as osu from "node-os-utils";
import utils from "../utils";
const { mem, cpu, drive } = osu;

export default {
    data: {
        name: "botinfo",
        description: "Este comando sirve para ver estadísticas del bot.",
        aliases: ["info", "stats"],
        guildOnly: false,
        requiredGuildPermissions: [],
        category: "info"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const msg = await reply(lang !== "es" ? (await utils.translate("Cargando...", "es", lang)).text : "Cargando...");
        const texts = {
            embed: {
                title: "Información general",
                description: "Aquí verás estadísticas generales del bot.",
                footer: "Santiago Morales © 2020 - 2025 All rights reserved.",
            },
            fields: {
                database: {
                    users: "Usuarios",
                    title: "Base de datos"
                },
                system: {
                    cpu: "Carga de la CPU",
                    storage: "Almacenamiento disponible",
                    title: "Sistema"
                },
                bot: {
                    cachedUsers: "Usuarios en la caché",
                    totalUsers: "Usuarios totales",
                    guilds: "Servidores",
                    channels: "Canales"
                }
            }
        }
        await utils.parallel({
            embed: async (callback: any) => {
                if (lang !== "es") {
                    texts.embed.description = (await utils.translate(texts.embed.description, "es", lang)).text;
                    texts.embed.title = (await utils.translate(texts.embed.title, "es", lang)).text;
                }
                callback(null, true);
            },
            fields: async (callback: any) => {
                if (lang !== "es") {
                    texts.fields.system.title = (await utils.translate(texts.fields.system.title, "es", lang)).text;
                    texts.fields.system.cpu = (await utils.translate(texts.fields.system.cpu, "es", lang)).text;
                    texts.fields.system.storage = (await utils.translate(texts.fields.system.storage, "es", lang)).text;
                    texts.fields.database.title = (await utils.translate(texts.fields.database.title, "es", lang)).text;
                    texts.fields.database.users = (await utils.translate(texts.fields.database.users, "es", lang)).text;
                    texts.fields.bot.cachedUsers = (await utils.translate(texts.fields.bot.cachedUsers, "es", lang)).text;
                    texts.fields.bot.totalUsers = (await utils.translate(texts.fields.bot.totalUsers, "es", lang)).text;
                    texts.fields.bot.guilds = (await utils.translate(texts.fields.bot.guilds, "es", lang)).text;
                    texts.fields.bot.channels = (await utils.translate(texts.fields.bot.channels, "es", lang)).text;
                }
                callback(null, true);
            }
        });
        let totalUsers = 0;
        for (const guild of message.client.guilds.cache.values()) {
            totalUsers += guild.memberCount;
        }
        const cpuUsage = `${await cpu.usage()}%`;
        const memUsage = `${Math.floor(process.memoryUsage().heapUsed / 1000000)}~ MB /${Math.round((await mem.info()).totalMemMb / 1024)}~ GB`;
        const storage = `${(await drive.info("/")).freeGb}/${(await drive.info("/")).totalGb} GB`;
        const embed = new EmbedBuilder()
            .setAuthor({ iconURL: message.author.displayAvatarURL(), name: message.author.tag })
            .setTitle(texts.embed.title)
            .setDescription(texts.embed.description)
            .addFields(
                {
                    name: "Bot",
                    value: `${texts.fields.bot.cachedUsers}: ${message.client.users.cache.size}\n${texts.fields.bot.totalUsers}: ${totalUsers}\n${texts.fields.bot.guilds}: ${message.client.guilds.cache.size}\n${texts.fields.bot.channels}: ${message.client.channels.cache.size}`,
                    inline: true
                },
                {
                    name: texts.fields.database.title,
                    value: `${texts.fields.database.users}: 0`,
                    inline: true
                },
                {
                    name: texts.fields.system.title,
                    value: `${texts.fields.system.cpu}: ${cpuUsage}\n${texts.fields.system.storage}: ${storage}\nRam: ${memUsage}`,
                    inline: true
                }
            )
            .setFooter({ text: texts.embed.footer })
            .setTimestamp()
            .setColor("Purple")
        await msg.delete();
        await reply({ embeds: [embed] } as unknown as string);
    }
}