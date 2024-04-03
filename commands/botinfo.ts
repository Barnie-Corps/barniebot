import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, TimestampStyles, time } from "discord.js";
import * as osu from "node-os-utils";
import utils from "../utils";
import db from "../mysql/database";
const { mem, cpu, drive } = osu;

export default {
    data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Shows bot's info"),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        function byteToGB(b: number): number {
            return ((b / 1024) / 1024) / 1024;
        }
        const users: any = await db.query("SELECT * FROM discord_users");
        let texts = {
            embed: {
                title: "Información general",
                description: "Aquí verás estadísticas generales del bot.",
                footer: "Santiago Morales © 2020 - 2025 All rights reserved.",
            },
            fields: {
                database: {
                    users: "Usuarios",
                    title: "Base de datos",
                    last_command: "Último comando ejecutado"
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
        let needTranslation: boolean = false;
        const Start = Date.now();
        let ExecutionTime: number;
        if (lang !== "es") {
            needTranslation = true;
            texts = await utils.autoTranslate(texts, "es", lang);
        }
        ExecutionTime = needTranslation ? Date.now() - Start : 0;
        let totalUsers = 0;
        for (const guild of interaction.client.guilds.cache.values()) {
            totalUsers += guild.memberCount;
        }
        const cpuUsage = `${await cpu.usage()}%`;
        const memUsage = `${Math.floor(process.memoryUsage().heapUsed / 1000000)} MB / ${Math.round((await mem.info()).totalMemMb / 1024)} GB`;
        const storage = `${(await drive.info("/")).freeGb}/${(await drive.info("/")).totalGb} GB`;
        const last_command_executed: any = await db.query("SELECT * FROM executed_commands WHERE is_last = TRUE"); 
        const lastU = await interaction.client.users.fetch(last_command_executed[0].uid);
        const embed = new EmbedBuilder()
            .setAuthor({ iconURL: interaction.user.displayAvatarURL(), name: interaction.user.tag })
            .setTitle(texts.embed.title)
            .setDescription(texts.embed.description)
            .addFields(
                {
                    name: "Bot",
                    value: `${texts.fields.bot.cachedUsers}: ${interaction.client.users.cache.size}\n${texts.fields.bot.totalUsers}: ${totalUsers}\n${texts.fields.bot.guilds}: ${interaction.client.guilds.cache.size}\n${texts.fields.bot.channels}: ${interaction.client.channels.cache.size}`,
                    inline: true
                },
                {
                    name: texts.fields.database.title,
                    value: `${texts.fields.database.users}: ${users.length}\n${texts.fields.database.last_command}: ${last_command_executed[0].command} - ${lastU?.username} (${time(last_command_executed[0].at, TimestampStyles.RelativeTime)})`,
                    inline: true
                },
                {
                    name: texts.fields.system.title,
                    value: `${texts.fields.system.cpu}: ${cpuUsage}\n${texts.fields.system.storage}: ${storage}\nRAM (app): ${memUsage}`,
                    inline: true
                }
            )
            .setFooter({ text: `${texts.embed.footer} ${needTranslation ? `Translation took ${ExecutionTime} ms` : ""}` })
            .setTimestamp()
            .setColor("Purple")
            await interaction.editReply({ embeds: [embed] });
    },
    epehemeral: false
}