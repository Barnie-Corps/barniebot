import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, TimestampStyles, time } from "discord.js";
import * as osu from "node-os-utils";
import utils from "../utils";
import db from "../mysql/database";
import type { ExecutedCommand } from "../types/interfaces";
import * as nodeDiskInfo from "node-disk-info";
import os from "os";
import fs from "fs";
import path from "path";

const { mem, cpu, drive } = osu;

export default {
    data: new SlashCommandBuilder()
        .setName("botinfo")
        .setDescription("Shows bot information and statistics"),
    category: "Info",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;
        const formatUptime = (seconds: number) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const parts: string[] = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0 || parts.length > 0) parts.push(`${hours}h`);
            parts.push(`${minutes}m`);
            return parts.join(" ");
        };
        const readVersion = () => {
            try {
                const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
                return typeof pkgJson.version === "string" ? pkgJson.version : "dev";
            } catch {
                return "dev";
            }
        };

        let texts = {
            embed: {
                title: "Bot Information",
                description: "Live stats for the bot, platform, and database.",
                footer: "BarnieBot system overview"
            },
            sections: {
                bot: "Bot",
                activity: "Activity",
                premium: "Premium",
                system: "System",
                runtime: "Runtime"
            },
            fields: {
                cached_users: "Cached users",
                total_users: "Estimated users",
                guilds: "Servers",
                channels: "Channels",
                commands: "Commands",
                last_command: "Last command",
                db_users: "DB users",
                db_guilds: "DB guilds",
                normal_messages: "Normal messages",
                global_messages: "Global messages",
                open_tickets: "Open tickets",
                vip_users: "VIP users",
                vip_guilds: "VIP guilds",
                free_ai_today: "Free AI messages today",
                cpu_load: "CPU load",
                memory_app: "App memory",
                memory_host: "Host memory",
                storage: "Storage",
                host_uptime: "Host uptime",
                bot_uptime: "Bot uptime",
                platform: "Platform",
                architecture: "Architecture",
                cpu_model: "CPU model",
                node: "Node.js",
                discordjs: "discord.js",
                version: "Version",
                pid: "Process ID",
                ws_ping: "WS ping",
                loop_delay: "Event loop delay"
            },
            common: {
                none: "N/A"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const totalUsers = interaction.client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0);
        const now = Date.now();
        const todayKey = utils.getUtcDateKey(now);
        const [
            dbUsersRaw,
            dbGuildsRaw,
            vipUsersRaw,
            vipGuildsRaw,
            freeAiTodayRowsRaw,
            lastCommandRowsRaw,
            messageCountRowsRaw,
            globalMessagesRowsRaw,
            openTicketsRowsRaw,
            staffRowsRaw,
            cpuUsage,
            memInfo
        ] = await Promise.all([
            db.query("SELECT COUNT(*) AS count FROM discord_users"),
            db.query("SELECT COUNT(*) AS count FROM guilds"),
            db.query("SELECT COUNT(*) AS count FROM vip_users WHERE end_date > ?", [now]),
            db.query("SELECT COUNT(*) AS count FROM vip_guilds WHERE end_date > ?", [now]),
            db.query("SELECT COALESCE(SUM(messages_used), 0) AS count FROM ai_chat_daily_usage WHERE usage_date = ?", [todayKey]),
            db.query("SELECT * FROM executed_commands WHERE is_last = TRUE"),
            db.query("SELECT COALESCE(SUM(count), 0) AS count FROM message_count"),
            db.query("SELECT COUNT(*) AS count FROM global_messages"),
            db.query("SELECT COUNT(*) AS count FROM support_tickets WHERE status = 'open'"),
            db.query("SELECT COUNT(*) AS count FROM staff"),
            cpu.usage(),
            mem.info()
        ]);
        const dbUsers = dbUsersRaw as unknown as Array<{ count: number }>;
        const dbGuilds = dbGuildsRaw as unknown as Array<{ count: number }>;
        const vipUsers = vipUsersRaw as unknown as Array<{ count: number }>;
        const vipGuilds = vipGuildsRaw as unknown as Array<{ count: number }>;
        const freeAiTodayRows = freeAiTodayRowsRaw as unknown as Array<{ count: number }>;
        const lastCommandRows = lastCommandRowsRaw as unknown as ExecutedCommand[];
        const messageCountRows = messageCountRowsRaw as unknown as Array<{ count: number }>;
        const globalMessagesRows = globalMessagesRowsRaw as unknown as Array<{ count: number }>;
        const openTicketsRows = openTicketsRowsRaw as unknown as Array<{ count: number }>;
        const staffRows = staffRowsRaw as unknown as Array<{ count: number }>;

        let storage = texts.common.none;
        if (process.platform !== "win32") {
            const info = await drive.info("/");
            storage = `${info.freeGb}/${info.totalGb} GB`;
        } else {
            const disk = nodeDiskInfo.getDiskInfoSync()[0];
            storage = `${bytesToGb(disk.available).toFixed(1)} GB / ${bytesToGb(disk.used + disk.available).toFixed(1)} GB`;
        }

        const t0 = Date.now();
        await new Promise<void>(resolve => setImmediate(resolve));
        const loopDelay = `${Date.now() - t0} ms`;
        const wsPing = `${interaction.client.ws.ping} ms`;
        const appMemory = process.memoryUsage();
        const cpuModel = os.cpus()[0]?.model ?? texts.common.none;
        const version = readVersion();
        const djsVersion = require("discord.js").version;
        const lastCommand = lastCommandRows[0];
        const lastUser = lastCommand?.uid ? await interaction.client.users.fetch(lastCommand.uid).catch(() => null) : null;
        const lastCommandText = lastCommand
            ? `/${lastCommand.command} • ${lastUser?.username ?? "Unknown"} • ${lastCommand.at ? time(lastCommand.at, TimestampStyles.RelativeTime) : texts.common.none}`
            : texts.common.none;

        const embed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle(texts.embed.title)
            .setDescription(texts.embed.description)
            .addFields(
                {
                    name: texts.sections.bot,
                    value: [
                        `${texts.fields.cached_users}: ${interaction.client.users.cache.size}`,
                        `${texts.fields.total_users}: ${totalUsers}`,
                        `${texts.fields.guilds}: ${interaction.client.guilds.cache.size}`,
                        `${texts.fields.channels}: ${interaction.client.channels.cache.size}`,
                        `${texts.fields.commands}: ${(interaction.client as any).commands?.size ?? 0}`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: texts.sections.activity,
                    value: [
                        `${texts.fields.last_command}: ${lastCommandText}`,
                        `${texts.fields.db_users}: ${dbUsers[0]?.count ?? 0}`,
                        `${texts.fields.db_guilds}: ${dbGuilds[0]?.count ?? 0}`,
                        `${texts.fields.normal_messages}: ${messageCountRows[0]?.count ?? 0}`,
                        `${texts.fields.global_messages}: ${globalMessagesRows[0]?.count ?? 0}`,
                        `${texts.fields.open_tickets}: ${openTicketsRows[0]?.count ?? 0}`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: texts.sections.premium,
                    value: [
                        `${texts.fields.vip_users}: ${vipUsers[0]?.count ?? 0}`,
                        `${texts.fields.vip_guilds}: ${vipGuilds[0]?.count ?? 0}`,
                        `${texts.fields.free_ai_today}: ${freeAiTodayRows[0]?.count ?? 0}`,
                        `${texts.fields.db_guilds}: ${dbGuilds[0]?.count ?? 0}`,
                        `Staff: ${staffRows[0]?.count ?? 0}`
                    ].join("\n"),
                    inline: true
                },
                {
                    name: texts.sections.system,
                    value: [
                        `${texts.fields.cpu_load}: ${cpuUsage}%`,
                        `${texts.fields.memory_app}: ${Math.floor(appMemory.heapUsed / 1024 / 1024)} MB`,
                        `${texts.fields.memory_host}: ${Math.round(memInfo.usedMemMb)} MB / ${Math.round(memInfo.totalMemMb)} MB`,
                        `${texts.fields.storage}: ${storage}`,
                        `${texts.fields.cpu_model}: ${cpuModel}`,
                        `${texts.fields.platform}: ${process.platform}`,
                        `${texts.fields.architecture}: ${process.arch}`,
                        `${texts.fields.host_uptime}: ${formatUptime(os.uptime())}`
                    ].join("\n"),
                    inline: false
                },
                {
                    name: texts.sections.runtime,
                    value: [
                        `${texts.fields.bot_uptime}: ${formatUptime(process.uptime())}`,
                        `${texts.fields.ws_ping}: ${wsPing}`,
                        `${texts.fields.loop_delay}: ${loopDelay}`,
                        `${texts.fields.node}: ${process.version}`,
                        `${texts.fields.discordjs}: ${djsVersion}`,
                        `${texts.fields.version}: v${version}`,
                        `${texts.fields.pid}: ${process.pid}`
                    ].join("\n"),
                    inline: false
                }
            )
            .setFooter({ text: texts.embed.footer })
            .setTimestamp();

        await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
    },
    ephemeral: false
};
