import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, TimestampStyles, time } from "discord.js";
import * as osu from "node-os-utils";
import utils from "../utils";
import db from "../mysql/database";
import * as nodeDiskInfo from "node-disk-info";
import os from "os";
import fs from "fs";
import path from "path";
const { mem, cpu, drive } = osu;

export default {
    data: new SlashCommandBuilder()
        .setName("botinfo")
        .setDescription("Shows bot's info"),
    category: "Info",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        function byteToGB(b: number): number {
            return ((b / 1024) / 1024) / 1024;
        }
        const users: any = await db.query("SELECT * FROM discord_users");
        let texts = {
            embed: {
                title: "General Information",
                description: "Here you will see general bot statistics.",
                footer: "Santiago Morales © 2020 - 2025 All rights reserved.",
            },
            fields: {
                database: {
                    users: "Users",
                    title: "Database",
                    last_command: "Last executed command",
                    normal_messages: "Normal messages",
                    global_messages: "Global messages",
                    tickets_open: "Open tickets",
                    staff_count: "Staff members"
                },
                system: {
                    cpu: "CPU Load",
                    storage: "Available storage",
                    title: "System",
                    platform: "Platform",
                    arch: "Architecture",
                    uptime_host: "Host uptime",
                    cpu_model: "CPU Model"
                },
                bot: {
                    cachedUsers: "Cached users",
                    totalUsers: "Total users",
                    guilds: "Servers",
                    channels: "Channels",
                    uptime_app: "Bot uptime",
                    ping_ws: "WS Ping",
                    loop_delay: "Event loop delay",
                    node: "Node.js",
                    djs: "discord.js",
                    version: "Version",
                    pid: "Process ID"
                },
                messages: "Messages"
            }
        }
        let needTranslation: boolean = false;
        const Start = Date.now();
        let ExecutionTime: number;
        if (lang !== "en") {
            needTranslation = true;
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        ExecutionTime = needTranslation ? Date.now() - Start : 0;
        let totalUsers = 0;
        for (const guild of interaction.client.guilds.cache.values()) {
            totalUsers += guild.memberCount;
        }
        const cpuUsage = `${await cpu.usage()}%`;
        const memUsage = `${Math.floor(process.memoryUsage().heapUsed / 1000000)} MB / ${Math.round((await mem.info()).totalMemMb / 1024)} GB`;
        let storage;
        if (process.platform !== "win32") {
            storage = `${(await drive.info("/")).freeGb}/${(await drive.info("/")).totalGb} GB`;
        }
        else {
            storage = `${byteToGB(nodeDiskInfo.getDiskInfoSync()[0].available).toFixed(1)} GB / ${byteToGB(nodeDiskInfo.getDiskInfoSync()[0].used + nodeDiskInfo.getDiskInfoSync()[0].available).toFixed(1)} GB`;
        }
        const last_command_executed: any = await db.query("SELECT * FROM executed_commands WHERE is_last = TRUE");
        const totalNormalMessages = utils.sumNumbers((await db.query("SELECT * FROM message_count") as any).map((m: any) => m.count));
        const totalGlobalMessages = (await db.query("SELECT COUNT(*) AS c FROM global_messages") as any)[0]?.c ?? 0;
        let openTickets = 0;
        try {
            openTickets = (await db.query("SELECT COUNT(*) AS c FROM support_tickets WHERE status = 'open'") as any)[0]?.c ?? 0;
        } catch {}
        let staffCount = 0;
        try {
            staffCount = (await db.query("SELECT COUNT(*) AS c FROM staff") as any)[0]?.c ?? 0;
        } catch {}
        const wsPing = `${interaction.client.ws.ping} ms`;
        const t0 = Date.now();
        await new Promise<void>(resolve => setImmediate(() => resolve()));
        const loopDelay = `${Date.now() - t0} ms`;
        const hostUptime = `${Math.floor(os.uptime() / 3600)}h ${(Math.floor(os.uptime() / 60) % 60)}m`;
        const appUptime = `${Math.floor(process.uptime() / 3600)}h ${(Math.floor(process.uptime() / 60) % 60)}m`;
        const cpuModel = Array.isArray(os.cpus()) && os.cpus().length ? os.cpus()[0].model : "Unknown";
        const nodeVersion = process.version;
        const djsVersion = (interaction.client as any).constructor?.name ? require("discord.js").version : require("discord.js").version;
        const pkgVersion: string = (() => {
            try {
                const pkgJsonRaw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
                const pkgJson = JSON.parse(pkgJsonRaw);
                return typeof pkgJson.version === "string" ? pkgJson.version : "dev";
            } catch {
                return "dev";
            }
        })();
        const lastU = await interaction.client.users.fetch(last_command_executed[0].uid);
        const embed = new EmbedBuilder()
            .setAuthor({ iconURL: interaction.user.displayAvatarURL(), name: interaction.user.tag })
            .setTitle(texts.embed.title)
            .setDescription(texts.embed.description)
            .addFields(
                {
                    name: "Bot",
                    value: `${texts.fields.bot.cachedUsers}: ${interaction.client.users.cache.size}\n${texts.fields.bot.totalUsers}: ${totalUsers}\n${texts.fields.bot.guilds}: ${interaction.client.guilds.cache.size}\n${texts.fields.bot.channels}: ${interaction.client.channels.cache.size}\n${texts.fields.bot.uptime_app}: ${appUptime}\n${texts.fields.bot.ping_ws}: ${wsPing}\n${texts.fields.bot.loop_delay}: ${loopDelay}`,
                    inline: true
                },
                {
                    name: texts.fields.database.title,
                    value: `${texts.fields.database.users}: ${users.length}\n${texts.fields.database.last_command}: ${last_command_executed[0].command} - ${lastU?.username} (${time(last_command_executed[0].at, TimestampStyles.RelativeTime)})\n${texts.fields.database.tickets_open}: ${openTickets}\n${texts.fields.database.staff_count}: ${staffCount}`,
                    inline: true
                },
                {
                    name: texts.fields.system.title,
                    value: `${texts.fields.system.cpu}: ${cpuUsage}\n${texts.fields.system.storage}: ${storage}\nRAM (app): ${memUsage}\n${texts.fields.system.platform}: ${process.platform}\n${texts.fields.system.arch}: ${process.arch}\n${texts.fields.system.cpu_model}: ${cpuModel}\n${texts.fields.system.uptime_host}: ${hostUptime}`,
                    inline: true
                },
                {
                    name: texts.fields.messages,
                    value: `${texts.fields.database.normal_messages}: ${totalNormalMessages}\n${texts.fields.database.global_messages}: ${totalGlobalMessages}`,
                    inline: true
                },
                {
                    name: "Runtime",
                    value: `${texts.fields.bot.node}: ${nodeVersion}\n${texts.fields.bot.djs}: ${djsVersion}\n${texts.fields.bot.version}: v${pkgVersion}\n${texts.fields.bot.pid}: ${process.pid}`,
                    inline: true
                }
            )
            .setFooter({ text: `${texts.embed.footer} ${needTranslation ? `Translation took ${ExecutionTime} ms` : ""}` })
            .setTimestamp()
            .setColor("Purple")
        await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
    },
    epehemeral: false
}