/**
 * Open source discord bot created by r3tr00_ (owner of Barnie Corps)
 * Please read the license at LICENSE in the root of the project.
 * It is highly recommended that you read the license before using this bot's code but if you do not, you can do so at https://opensource.org/licenses/MIT.
 * Here's a summary of the license:
 * The MIT License (MIT)
 * Copyright (c) 2025 Barnie Corps
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * Also it's important to know that even though you can use this bot's code for your own purposes, you cannot claim it as your own and must give credit to the original creator.
 * See based.txt to get comments to put in your discord bot based on BarnieBot, you should put 'em but it's not completely necessary.
 * Certificate of registration: https://www.copyrighted.com/work/23e3X3GmrHeYiS1d
 */
global.ReadableStream = require('web-streams-polyfill').ReadableStream;
global.Headers = require("node-fetch").Headers;
globalThis.fetch = require("node-fetch");
import * as dotenv from "dotenv";
dotenv.config();
if (!process.env.REBOOTING) process.env.REBOOTING = "0";
import { EmbedBuilder, GatewayIntentBits, Client, ActivityType, Partials, PermissionFlagsBits, WebhookClient, TextChannel, Message, time, TimestampStyles, Collection, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as fs from "fs";
import data from "./data";
import Log from "./Log";
import queries from "./mysql/queries";
import db from "./mysql/database";
import { initializeShopItems, initializeRPGData } from "./rpg_init";
import utils from "./utils";
import load_slash from "./load_slash";
import ChatManager from "./managers/ChatManager";
import StaffRanksManager from "./managers/StaffRanksManager";
import GlobalCommandsManager from "./managers/GlobalCommandsManager";
import WarningCleanup from "./WarningCleanup";
import Workers from "./Workers";
import path from "path";
import { inspect } from "util";
import langs from "langs";
import NVIDIAModels from "./NVIDIAModels";
import AiMonitorManager from "./managers/AiMonitorManager";
const manager = new ChatManager();
const globalCommandsManager = new GlobalCommandsManager();
process.on("uncaughtException", (err: any) => {
    Log.error("Unhandled exception", err);
});
process.on("unhandledRejection", (err: any) => {
    Log.error("Unhandled rejection", err as any);
});
const client = new Client({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages, GatewayIntentBits.DirectMessageTyping, GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});
const aiMonitor = new AiMonitorManager(client);
(async function () {
    const commandsDir = fs.readdirSync("./commands").filter(f => f.endsWith(".ts"));
    for (const cmdFile of commandsDir) {
        try {
            const command = (await import(`./commands/${cmdFile.trim().split(".")[0]}`)).default;
            data.bot.commands.set(command.data.name, command);
        }
        catch (err: any) {
            Log.error("Command loading failed", new Error(`Failed to load command file '${cmdFile}': ${err.stack}`));
        }
    }
    Log.success(`Commands loaded successfully`, {
        component: "CommandLoader",
        loadedCommands: data.bot.commands.size,
        totalCommands: commandsDir.length
    });
})();

client.on("clientReady", async (): Promise<any> => {
    Log.success(`Bot logged in successfully`, {
        component: "Bot",
        username: client.user?.tag
    });
    queries();
    await StaffRanksManager.initialize();
    initializeShopItems();
    initializeRPGData();
    const staffMembers: any = await db.query("SELECT * FROM staff");
    for (const staff of staffMembers) {
        try {
            await client.users.fetch(staff.uid);
        }
        catch { }
    }
    if (Number(process.env.FETCH_MEMBERS_ON_STARTUP) === 1) {
        client.user?.setPresence({ activities: [{ name: `how many members are here? *finding out*`, type: ActivityType.Watching }], afk: true });
        Log.info("Fetching members from guilds...", { component: "Initialization" });
        for (const g of client.guilds.cache.values()) await g.members.fetch();
        process.env.MEMBERS_FETCHED = "1";
    }
    client.user?.setPresence({ activities: [{ name: Number(process.env.FETCH_MEMBERS_ON_STARTUP) === 1 ? `there are ${client.users.cache.size} users around!` : "How robotically mysterious!", type: ActivityType.Watching }] });
    await load_slash();
    Log.info(`Cache status`, {
        component: "Bot",
        usersCacheSize: client.users.cache.size
    });
    data.bot.owners.push(...String(process.env.OWNERS).trim().split(","));
    for (const ownerId of data.bot.owners) {
        try { await db.query("INSERT IGNORE INTO staff SET ?", [{ uid: ownerId, rank: "Owner" }]); } catch { }
    }
    Log.info("Owners data loaded", { component: "Initialization" });
    Log.info("Loading workers...", { component: "Initialization" });
    if (Number(process.env.SAFELY_SHUTTED_DOWN) === 0 && Number(process.env.NOTIFY_STARTUP) === 1) {
        await manager.announce("Hey! I have been restarted. According to my records it was a forced restart, so I could not warn you in advance. We apologize for any inconvenience or downtime this may have caused.", "en");
    }
    else if (Number(process.env.NOTIFY_STARTUP) === 1) await manager.announce("I'm back! The global chat is online again.", "en");
    if (process.env.REBOOTING === "1") {
        try {
            await manager.announce("✅ Reboot complete! I'm back online and ready.", "en");
        } catch (e) {
            Log.warn("Failed to send reboot completion announcement", { component: "Startup" });
        }
        process.env.REBOOTING = "0";
        try {
            const envContents = fs.readFileSync('./.env').toString();
            let updated = envContents;
            if (updated.includes("REBOOTING=1")) updated = updated.replace("REBOOTING=1", "REBOOTING=0");
            else if (!updated.includes("REBOOTING=")) updated += "\nREBOOTING=0";
            fs.writeFileSync('./.env', updated);
        } catch { }
    }
    Workers.bulkCreateWorkers(path.join(__dirname, "workers", "translate.js"), "translate", 5);
    fs.writeFileSync("./.env", fs.readFileSync('./.env').toString().replace("SAFELY_SHUTTED_DOWN=1", "SAFELY_SHUTTED_DOWN=0"));
    Log.info("Workers loaded", { component: "WorkerSystem" });

    WarningCleanup.startWarningCleanupScheduler();

    Log.info("Bot is ready", { component: "System" });
});

const activeGuilds: Collection<string, number> = new Collection();
const shutdownState = { inProgress: false, mode: "" };

const updateEnvFlag = (key: string, value: string) => {
    try {
        const envPath = './.env';
        const envContents = fs.existsSync(envPath) ? fs.readFileSync(envPath).toString() : "";
        const line = `${key}=${value}`;
        let updated = envContents;
        if (updated.includes(`${key}=`)) {
            updated = updated.replace(new RegExp(`${key}=.*`, "m"), line);
        } else {
            updated = updated.trim().length ? `${updated}\n${line}` : line;
        }
        fs.writeFileSync(envPath, updated);
        process.env[key] = value;
    } catch (e: any) {
        Log.warn("Failed to update env flag", { component: "Shutdown", key, error: e?.message || String(e) });
    }
};

const markShutdownMode = (mode: "shutdown" | "reboot") => {
    updateEnvFlag("SAFELY_SHUTTED_DOWN", "1");
    updateEnvFlag("REBOOTING", mode === "reboot" ? "1" : "0");
};
interface FilterSetupState {
    step: number;
    values: { enabled: boolean; logs_enabled: boolean; logs_channel: string; lang: string };
    messageId: string;
    guildId: string;
    userId: string;
    createdAt: number;
    awaitingChannelMention?: boolean;
}
const filterSetupSessions = new Map<string, FilterSetupState>();

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    const foundCount: any = await db.query("SELECT * FROM message_count WHERE uid = ?", [message.author.id]);
    if (!foundCount[0]) {
        await db.query("INSERT INTO message_count SET ?", [{ uid: message.author.id }]);
    }
    else {
        await db.query("UPDATE message_count SET count = ? WHERE uid = ?", [(foundCount[0].count as number) + 1, message.author.id]);
    }
    if (activeGuilds.has(message.guildId as string)) {
        const agValue = activeGuilds.get(message.guildId as string);
        activeGuilds.set(message.guildId as string, (agValue as number) + 1);
    }
    else {
        activeGuilds.set(message.guildId as string, 1);
    }
    const prefix = "b.";
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en";
    if (message.content.toLowerCase().startsWith(prefix) && !data.bot.owners.includes(message.author.id)) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    const [command, ...args] = message.content.slice(prefix.length).trim().split(" ");
    switch (command) {
        case "shutdown": {
            if (shutdownState.inProgress) {
                await message.reply("Shutdown already in progress.");
                break;
            }
            shutdownState.inProgress = true;
            shutdownState.mode = "shutdown";
            const shutdownEmbed = new EmbedBuilder()
                .setColor("#E74C3C")
                .setTitle("🔴 System Shutdown Initiated")
                .setDescription("```ansi\n\u001b[1;31m[CRITICAL]\u001b[0m Graceful shutdown sequence started...\n```")
                .addFields(
                    { name: "📡 Status", value: "Broadcasting shutdown notice...", inline: true },
                    { name: "⏱️ ETA", value: "< 5 seconds", inline: true }
                )
                .setFooter({ text: `Initiated by ${message.author.username}` })
                .setTimestamp();
            const shutdownMsg = await message.reply({ embeds: [shutdownEmbed] });
            try {
                await manager.announce("⚠️ System going offline for maintenance. Be back soon!", "en");
            } catch (e) {
                Log.warn("Failed to announce shutdown", { component: "Shutdown", error: (e as any)?.message || String(e) });
            }
            markShutdownMode("shutdown");
            try {
                const updated = EmbedBuilder.from(shutdownEmbed)
                    .setDescription("```ansi\n\u001b[1;31m[CRITICAL]\u001b[0m Shutdown notice sent. Flushing and exiting...\n```")
                    .setFields(
                        { name: "📡 Status", value: "Notice sent", inline: true },
                        { name: "⏱️ ETA", value: "< 5 seconds", inline: true }
                    );
                await shutdownMsg.edit({ embeds: [updated.toJSON()] });
            } catch (e) {
                Log.warn("Failed to update shutdown embed", { component: "Shutdown", error: (e as any)?.message || String(e) });
            }
            setTimeout(() => {
                try { client.destroy(); } finally { process.exit(0); }
            }, 4000);
            break;
        }
        case "reboot": {
            if (shutdownState.inProgress) {
                await message.reply("Shutdown already in progress.");
                break;
            }
            shutdownState.inProgress = true;
            shutdownState.mode = "reboot";
            const rebootEmbed = new EmbedBuilder()
                .setColor("#F39C12")
                .setTitle("🔄 System Reboot Sequence")
                .setDescription("```ansi\n\u001b[1;33m[SYSTEM]\u001b[0m Initiating controlled restart...\n```")
                .addFields(
                    { name: "📡 Phase 1", value: "✅ Broadcasting notice", inline: true },
                    { name: "📡 Phase 2", value: "⏳ Saving state", inline: true },
                    { name: "📡 Phase 3", value: "⏳ Restart", inline: true }
                )
                .setFooter({ text: `Initiated by ${message.author.username} • ProcessManager will auto-restart` })
                .setTimestamp();
            const rebootMsg = await message.reply({ embeds: [rebootEmbed] });
            try {
                await manager.announce("🔄 Quick restart incoming! Back in ~10 seconds.", "en");
            } catch (e) {
                Log.warn("Failed to announce reboot", { component: "Reboot", error: (e as any)?.message || String(e) });
            }
            markShutdownMode("reboot");
            try {
                const updated = EmbedBuilder.from(rebootEmbed)
                    .setDescription("```ansi\n\u001b[1;33m[SYSTEM]\u001b[0m Notice sent. Restarting services...\n```")
                    .setFields(
                        { name: "📡 Phase 1", value: "✅ Notice sent", inline: true },
                        { name: "📡 Phase 2", value: "✅ State saved", inline: true },
                        { name: "📡 Phase 3", value: "🔄 Restarting", inline: true }
                    );
                await rebootMsg.edit({ embeds: [updated.toJSON()] });
            } catch (e) {
                Log.warn("Failed to update reboot embed", { component: "Reboot", error: (e as any)?.message || String(e) });
            }
            setTimeout(() => {
                try { client.destroy(); } finally { process.exit(1); }
            }, 2500);
            break;
        }
        case "status": {
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const mem = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const totalMem = (mem.heapTotal / 1024 / 1024).toFixed(1);
            const usedMem = (mem.heapUsed / 1024 / 1024).toFixed(1);
            const memPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
            const memBar = "█".repeat(Math.floor(Number(memPercent) / 10)) + "░".repeat(10 - Math.floor(Number(memPercent) / 10));
            const statusEmbed = new EmbedBuilder()
                .setColor("#2ECC71")
                .setTitle("📊 System Status Dashboard")
                .setDescription("```ansi\n\u001b[1;32m[ONLINE]\u001b[0m All systems operational\n```")
                .addFields(
                    { name: "⏱️ Uptime", value: `\`${days}d ${hours}h ${minutes}m ${seconds}s\``, inline: true },
                    { name: "🏰 Guilds", value: `\`${client.guilds.cache.size.toLocaleString()}\``, inline: true },
                    { name: "👥 Users", value: `\`${client.users.cache.size.toLocaleString()}\``, inline: true },
                    { name: "💾 Memory", value: `\`[${memBar}] ${memPercent}%\`\n${usedMem}MB / ${totalMem}MB`, inline: false },
                    { name: "🔧 Process", value: `PID: \`${process.pid}\` | Node: \`${process.version}\``, inline: true },
                    { name: "📦 Commands", value: `\`${data.bot.commands.size}\` loaded`, inline: true }
                )
                .setFooter({ text: `Last restart: ${new Date(Date.now() - uptime * 1000).toLocaleString()}` })
                .setTimestamp();
            await message.reply({ embeds: [statusEmbed] });
            break;
        }
        case "announce": {
            if (args.length < 2) {
                const usageEmbed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("📢 Announce Command")
                    .setDescription("```\nb.announce <language> <message>\n```")
                    .addFields({ name: "Example", value: "`b.announce en Hello everyone!`" });
                return await message.reply({ embeds: [usageEmbed] });
            }
            const [language, ...msg] = args;
            const announceEmbed = new EmbedBuilder()
                .setColor("#3498DB")
                .setTitle("📢 Broadcasting Announcement")
                .addFields(
                    { name: "🌐 Language", value: `\`${language}\``, inline: true },
                    { name: "📝 Message", value: msg.join(" ").substring(0, 100) + (msg.join(" ").length > 100 ? "..." : ""), inline: false }
                )
                .setFooter({ text: `Sent by ${message.author.username}` })
                .setTimestamp();
            await message.reply({ embeds: [announceEmbed] });
            await manager.announce(msg.join(" "), language, message.attachments);
            break;
        }
        case "messages": {
            const [id] = args;
            if (!id) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Please provide a user ID.")] });
            }
            const loadMsg = await message.reply({ embeds: [new EmbedBuilder().setColor("#F39C12").setDescription("🔍 Fetching message history...")] });
            const msg: any = await db.query("SELECT * FROM global_messages WHERE uid = ?", [id]);
            if (!msg[0]) return await loadMsg.edit({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ No messages found for this user.")] });
            const user = await client.users.fetch(msg[0].uid);
            const report = `╔══════════════════════════════════════════════════════════════╗
║                    GLOBAL CHAT MESSAGE REPORT                  ║
╠══════════════════════════════════════════════════════════════╣
║ User: ${user.username.padEnd(54)}║
║ ID: ${user.id.padEnd(56)}║
║ Total Messages: ${String(msg.length).padEnd(44)}║
║ Generated: ${new Date().toISOString().padEnd(49)}║
╚══════════════════════════════════════════════════════════════╝

${"─".repeat(64)}
${msg.map((m: any, i: number) => `[${String(i + 1).padStart(4, "0")}] ${new Date(m.created_at || Date.now()).toISOString()}\n       ${utils.decryptWithAES(data.bot.encryption_key, m.content)}`).join(`\n${"─".repeat(64)}\n`)}
${"─".repeat(64)}`;
            fs.writeFileSync(`./messages_report_${user.id}.txt`, report);
            const reportEmbed = new EmbedBuilder()
                .setColor("#2ECC71")
                .setTitle("📋 Message Report Generated")
                .addFields(
                    { name: "👤 User", value: `${user.username} (\`${user.id}\`)`, inline: true },
                    { name: "📊 Messages", value: `\`${msg.length}\``, inline: true }
                )
                .setTimestamp();
            await loadMsg.edit({ embeds: [reportEmbed], files: [`./messages_report_${user.id}.txt`] });
            fs.unlinkSync(`./messages_report_${user.id}.txt`);
            break;
        }
        case "invite": {
            const [sid] = args;
            if (!sid) return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Please provide a guild ID.")] });
            const server = client.guilds.cache.get(sid);
            if (!server) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Guild not found in cache.")] });
            const channel = server.channels.cache.find(c => c.isTextBased());
            if (!channel) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ No text channel found.")] });
            const invite = await channel.guild.invites.create(channel as TextChannel, { maxAge: 0, maxUses: 1 });
            const inviteEmbed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle("🔗 Invite Generated")
                .addFields(
                    { name: "🏰 Guild", value: server.name, inline: true },
                    { name: "👥 Members", value: `\`${server.memberCount}\``, inline: true },
                    { name: "🔗 Link", value: `||${invite.url}||`, inline: false }
                )
                .setThumbnail(server.iconURL({ size: 128 }))
                .setFooter({ text: "Single-use invite • Never expires" })
                .setTimestamp();
            await message.reply({ embeds: [inviteEmbed] });
            break;
        }
        case "guilds": {
            const sorted = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
            const totalMembers = sorted.reduce((acc, g) => acc + g.memberCount, 0);
            const report = `╔══════════════════════════════════════════════════════════════════════════════╗
║                           GUILD REGISTRY REPORT                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Total Guilds: ${String(sorted.length).padEnd(62)}║
║ Total Members: ${String(totalMembers.toLocaleString()).padEnd(61)}║
║ Generated: ${new Date().toISOString().padEnd(65)}║
╚══════════════════════════════════════════════════════════════════════════════╝

${"═".repeat(78)}
${"#".padEnd(5)} ${"Guild Name".padEnd(35)} ${"Members".padEnd(10)} ${"ID".padEnd(20)}
${"═".repeat(78)}
${sorted.map((g, i) => `${String(i + 1).padEnd(5)} ${g.name.substring(0, 33).padEnd(35)} ${String(g.memberCount).padEnd(10)} ${g.id}`).join("\n")}
${"═".repeat(78)}`;
            fs.writeFileSync("./guilds.txt", report);
            const guildsEmbed = new EmbedBuilder()
                .setColor("#3498DB")
                .setTitle("🏰 Guild Registry")
                .addFields(
                    { name: "📊 Total Guilds", value: `\`${sorted.length}\``, inline: true },
                    { name: "👥 Total Members", value: `\`${totalMembers.toLocaleString()}\``, inline: true },
                    { name: "🏆 Largest", value: sorted[0] ? `${sorted[0].name} (${sorted[0].memberCount})` : "N/A", inline: true }
                )
                .setTimestamp();
            await message.reply({ embeds: [guildsEmbed], files: ["./guilds.txt"] });
            fs.unlinkSync('./guilds.txt');
            break;
        }
        case "eval": {
            if (!data.bot.owners.includes(message.author.id)) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("🔒 Access Denied")] });
            const targetCode = args.join(' ');
            if (!targetCode) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ No code provided.\n```\nb.eval <code>\n```")] });
            try {
                const start = Date.now();
                let evalued = eval(targetCode);
                if (evalued instanceof Promise) evalued = await evalued;
                const done = Date.now() - start;
                const outputType = typeof evalued;
                const output = inspect(evalued, { depth: 2, maxArrayLength: 50 });
                const embed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle("✅ Code Executed Successfully")
                    .setDescription("```ansi\n\u001b[1;32m[SUCCESS]\u001b[0m Evaluation complete\n```")
                    .addFields(
                        { name: "📊 Type", value: `\`\`\`ts\n${outputType}\`\`\``, inline: true },
                        { name: "⏱️ Execution", value: `\`\`\`yaml\n${done}ms\`\`\``, inline: true },
                        { name: "📥 Input", value: `\`\`\`js\n${targetCode.length > 900 ? `${targetCode.substring(0, 900)}...` : targetCode}\`\`\`` },
                        { name: "📤 Output", value: `\`\`\`js\n${output.length > 900 ? `${output.substring(0, 900)}...` : output}\`\`\`` }
                    )
                    .setFooter({ text: `Executed by ${message.author.username}` })
                    .setTimestamp();
                await message.reply({ embeds: [embed] });
            } catch (error: any) {
                const errorMessage = error?.stack || error?.message || String(error);
                const errorEmbed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("❌ Execution Failed")
                    .setDescription("```ansi\n\u001b[1;31m[ERROR]\u001b[0m Runtime exception caught\n```")
                    .addFields(
                        { name: "📥 Input", value: `\`\`\`js\n${targetCode.length > 900 ? `${targetCode.substring(0, 900)}...` : targetCode}\`\`\`` },
                        { name: "💥 Error", value: `\`\`\`js\n${errorMessage.length > 900 ? `${errorMessage.substring(0, 900)}...` : errorMessage}\`\`\`` }
                    )
                    .setFooter({ text: `Failed for ${message.author.username}` })
                    .setTimestamp();
                await message.reply({ embeds: [errorEmbed] });
            }
            break;
        }
        case "sql": {
            if (!data.bot.owners.includes(message.author.id)) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("🔒 Access Denied")] });
            const query = args.join(' ');
            if (!query) return message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ No query provided.\n```\nb.sql <query>\n```")] });
            try {
                const start = Date.now();
                const result: any = await db.query(query);
                const done = Date.now() - start;
                const output = inspect(result, { depth: 2, maxArrayLength: 20 });
                const embed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle("🗄️ SQL Query Executed")
                    .addFields(
                        { name: "⏱️ Time", value: `\`${done}ms\``, inline: true },
                        { name: "📊 Rows", value: `\`${Array.isArray(result) ? result.length : "N/A"}\``, inline: true },
                        { name: "📥 Query", value: `\`\`\`sql\n${query.length > 500 ? query.substring(0, 500) + "..." : query}\`\`\`` },
                        { name: "📤 Result", value: `\`\`\`js\n${output.length > 900 ? output.substring(0, 900) + "..." : output}\`\`\`` }
                    )
                    .setTimestamp();
                await message.reply({ embeds: [embed] });
            } catch (error: any) {
                const errorEmbed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("❌ SQL Error")
                    .addFields(
                        { name: "📥 Query", value: `\`\`\`sql\n${query.length > 500 ? query.substring(0, 500) + "..." : query}\`\`\`` },
                        { name: "💥 Error", value: `\`\`\`\n${error?.message || String(error)}\`\`\`` }
                    )
                    .setTimestamp();
                await message.reply({ embeds: [errorEmbed] });
            }
            break;
        }
        case "cache": {
            const cacheEmbed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle("💾 Cache Statistics")
                .addFields(
                    { name: "👥 Users", value: `\`${client.users.cache.size.toLocaleString()}\``, inline: true },
                    { name: "🏰 Guilds", value: `\`${client.guilds.cache.size.toLocaleString()}\``, inline: true },
                    { name: "📢 Channels", value: `\`${client.channels.cache.size.toLocaleString()}\``, inline: true },
                    { name: "😀 Emojis", value: `\`${client.emojis.cache.size.toLocaleString()}\``, inline: true },
                    { name: "📝 Messages", value: `\`${[...client.channels.cache.values()].reduce((acc: number, c: any) => acc + (c.messages?.cache?.size || 0), 0).toLocaleString()}\``, inline: true },
                    { name: "🎭 Roles", value: `\`${[...client.guilds.cache.values()].reduce((acc, g) => acc + g.roles.cache.size, 0).toLocaleString()}\``, inline: true }
                )
                .setTimestamp();
            await message.reply({ embeds: [cacheEmbed] });
            break;
        }
        case "active_guilds": {
            const guilds = [...activeGuilds.entries()].map(([id, value]) => ({
                id,
                value,
                name: client.guilds.cache.get(id)?.name || "Unknown",
                members: client.guilds.cache.get(id)?.memberCount || 0
            })).sort((a, b) => b.value - a.value);
            if (guilds.length < 1) return await message.reply({ embeds: [new EmbedBuilder().setColor("#F39C12").setDescription("📊 No active guilds recorded this session.")] });
            const top10 = guilds.slice(0, 10);
            const totalMessages = guilds.reduce((acc, g) => acc + g.value, 0);
            const activeEmbed = new EmbedBuilder()
                .setColor("#2ECC71")
                .setTitle("📊 Active Guilds Leaderboard")
                .setDescription(`\`${guilds.length}\` guilds active • \`${totalMessages.toLocaleString()}\` total messages`)
                .addFields(
                    ...top10.map((g, i) => ({
                        name: `${["🥇", "🥈", "🥉"][i] || `#${i + 1}`} ${g.name}`,
                        value: `\`${g.value.toLocaleString()}\` msgs • \`${g.members.toLocaleString()}\` members\n\`${g.id}\``,
                        inline: true
                    }))
                )
                .setFooter({ text: "Showing top 10 • Reset on restart" })
                .setTimestamp();
            await message.reply({ embeds: [activeEmbed] });
            break;
        }
        case "add_vip": {
            if (!args[0]) {
                const usageEmbed = new EmbedBuilder()
                    .setColor("#9B59B6")
                    .setTitle("👑 Add VIP Command")
                    .setDescription("```\nb.add_vip <userId> <duration> <unit>\n```")
                    .addFields(
                        { name: "Units", value: "`seconds` `minutes` `hours` `days`", inline: false },
                        { name: "Example", value: "`b.add_vip 123456789 30 days`", inline: false }
                    );
                return await message.reply({ embeds: [usageEmbed] });
            }
            const [uid, newTime, timeType] = args;
            if ([uid, newTime, timeType].some(v => !v)) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Missing arguments: `<userId> <duration> <unit>`")] });
            }
            const multiply = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
            if (isNaN(parseInt(uid))) return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Invalid user ID.")] });
            let targetUser;
            try {
                targetUser = await client.users.fetch(uid);
            } catch {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ User not found.")] });
            }
            if (isNaN(parseInt(newTime))) return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Invalid duration.")] });
            if (!Object.keys(multiply).includes(timeType.toLowerCase())) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription(`❌ Invalid unit. Use: \`${Object.keys(multiply).join("`, `")}\``)] });
            }
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [uid]);
            const totalTime = (1000 * multiply[timeType.toLowerCase() as keyof typeof multiply]) * parseInt(newTime);
            const now = Date.now();
            const end = now + totalTime;
            const vipEmbed = new EmbedBuilder()
                .setColor("#FFD700")
                .setTitle("👑 VIP Status Updated")
                .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: "👤 User", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                    { name: "⏱️ Duration", value: `\`${newTime} ${timeType}\``, inline: true },
                    { name: "📅 Expires", value: `${time(Math.round(end / 1000), TimestampStyles.ShortDateTime)}\n${time(Math.round(end / 1000), TimestampStyles.RelativeTime)}`, inline: true }
                )
                .setTimestamp();
            if (foundVip[0]) {
                vipEmbed.setDescription("```ansi\n\u001b[1;33m[UPDATED]\u001b[0m VIP subscription extended\n```");
                vipEmbed.addFields({ name: "📊 Previous Expiry", value: `${time(Math.round(foundVip[0].end_date / 1000), TimestampStyles.ShortDateTime)}`, inline: true });
                await db.query("UPDATE vip_users SET end_date = ? WHERE id = ?", [end, uid]);
            } else {
                vipEmbed.setDescription("```ansi\n\u001b[1;32m[NEW]\u001b[0m VIP subscription activated\n```");
                await db.query("INSERT INTO vip_users SET ?", [{ id: uid, start_date: now, end_date: end }]);
            }
            await message.reply({ embeds: [vipEmbed] });
            break;
        }
        case "remove_vip": {
            if (!args[0]) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#9B59B6").setTitle("👑 Remove VIP").setDescription("```\nb.remove_vip <userId>\n```")] });
            }
            const [uid] = args;
            if (isNaN(parseInt(uid))) return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ Invalid user ID.")] });
            let targetUser;
            try {
                targetUser = await client.users.fetch(uid);
            } catch {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#E74C3C").setDescription("❌ User not found.")] });
            }
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [uid]);
            if (!foundVip[0]) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#F39C12").setDescription(`⚠️ **${targetUser.username}** is not a VIP member.`)] });
            }
            await db.query("DELETE FROM vip_users WHERE id = ?", [uid]);
            const removeEmbed = new EmbedBuilder()
                .setColor("#E74C3C")
                .setTitle("👑 VIP Revoked")
                .setDescription("```ansi\n\u001b[1;31m[REMOVED]\u001b[0m VIP subscription terminated\n```")
                .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: "👤 User", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                    { name: "📅 Was Active Until", value: `${time(Math.round(foundVip[0].end_date / 1000), TimestampStyles.ShortDateTime)}`, inline: true }
                )
                .setFooter({ text: `Revoked by ${message.author.username}` })
                .setTimestamp();
            await message.reply({ embeds: [removeEmbed] });
            break;
        }
        case "vip_list": {
            const vips: any = await db.query("SELECT * FROM vip_users ORDER BY end_date DESC");
            if (!vips.length) {
                return await message.reply({ embeds: [new EmbedBuilder().setColor("#F39C12").setDescription("👑 No VIP members currently.")] });
            }
            const vipList = await Promise.all(vips.slice(0, 15).map(async (v: any, i: number) => {
                try {
                    const u = await client.users.fetch(v.id);
                    const isExpired = v.end_date < Date.now();
                    return `${isExpired ? "⚫" : "🟢"} **${u.username}** • ${time(Math.round(v.end_date / 1000), TimestampStyles.RelativeTime)}`;
                } catch {
                    return `⚫ \`${v.id}\` • ${time(Math.round(v.end_date / 1000), TimestampStyles.RelativeTime)}`;
                }
            }));
            const listEmbed = new EmbedBuilder()
                .setColor("#FFD700")
                .setTitle("👑 VIP Members")
                .setDescription(vipList.join("\n"))
                .setFooter({ text: `${vips.length} total VIP members` })
                .setTimestamp();
            await message.reply({ embeds: [listEmbed] });
            break;
        }
        case "fetch_guilds_members": {
            const fetchEmbed = new EmbedBuilder()
                .setColor("#3498DB")
                .setTitle("📡 Fetching Guild Members")
                .setDescription("```ansi\n\u001b[1;34m[SYNC]\u001b[0m Synchronizing member cache...\n```")
                .addFields({ name: "📊 Current Cache", value: `\`${client.users.cache.size.toLocaleString()}\` users`, inline: true });
            const msg = await message.reply({ embeds: [fetchEmbed] });
            const startTime = Date.now();
            const startCacheSize = client.users.cache.size;
            let fetchedGuilds = 0;
            for (const g of client.guilds.cache.values()) {
                await g.members.fetch();
                fetchedGuilds++;
            }
            process.env.MEMBERS_FETCHED = "1";
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            const newMembers = client.users.cache.size - startCacheSize;
            const doneEmbed = new EmbedBuilder()
                .setColor("#2ECC71")
                .setTitle("📡 Member Fetch Complete")
                .setDescription("```ansi\n\u001b[1;32m[DONE]\u001b[0m Cache synchronization complete\n```")
                .addFields(
                    { name: "⏱️ Duration", value: `\`${elapsed}s\``, inline: true },
                    { name: "🏰 Guilds Synced", value: `\`${fetchedGuilds}\``, inline: true },
                    { name: "👥 New Users", value: `\`+${newMembers.toLocaleString()}\``, inline: true },
                    { name: "📊 Total Cache", value: `\`${client.users.cache.size.toLocaleString()}\` users`, inline: true }
                )
                .setTimestamp();
            await msg.edit({ embeds: [doneEmbed] });
            break;
        }
    }
});

client.on("messageCreate", async (message): Promise<any> => {
    try {
        await aiMonitor.handleMessageCreate(message);
    } catch (error: any) {
        Log.warn("AI monitor messageCreate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("messageUpdate", async (oldMessage, newMessage): Promise<any> => {
    try {
        await aiMonitor.handleMessageUpdate(oldMessage as any, newMessage as any);
    } catch (error: any) {
        Log.warn("AI monitor messageUpdate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("messageDelete", async (message): Promise<any> => {
    try {
        await aiMonitor.handleMessageDelete(message as any);
    } catch (error: any) {
        Log.warn("AI monitor messageDelete failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("guildMemberAdd", async (member): Promise<any> => {
    try {
        await aiMonitor.handleMemberAdd(member);
    } catch (error: any) {
        Log.warn("AI monitor memberAdd failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("guildMemberRemove", async (member): Promise<any> => {
    try {
        const fullMember = "partial" in member && member.partial ? await member.fetch().catch(() => null) : member;
        if (!fullMember) return;
        await aiMonitor.handleMemberRemove(fullMember as any);
    } catch (error: any) {
        Log.warn("AI monitor memberRemove failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("channelCreate", async (channel): Promise<any> => {
    if (!("guild" in channel) || !channel.guild) return;
    try {
        await aiMonitor.handleChannelCreate(channel);
    } catch (error: any) {
        Log.warn("AI monitor channelCreate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("channelDelete", async (channel): Promise<any> => {
    if (!("guild" in channel) || !channel.guild) return;
    try {
        await aiMonitor.handleChannelDelete(channel);
    } catch (error: any) {
        Log.warn("AI monitor channelDelete failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("channelUpdate", async (oldChannel, newChannel): Promise<any> => {
    if (!("guild" in newChannel) || !newChannel.guild) return;
    try {
        await aiMonitor.handleChannelUpdate(oldChannel as any, newChannel as any);
    } catch (error: any) {
        Log.warn("AI monitor channelUpdate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("inviteCreate", async (invite): Promise<any> => {
    try {
        await aiMonitor.handleInviteCreate(invite as any);
    } catch (error: any) {
        Log.warn("AI monitor inviteCreate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("guildMemberUpdate", async (oldMember, newMember): Promise<any> => {
    try {
        await aiMonitor.handleMemberUpdate(oldMember as any, newMember as any);
    } catch (error: any) {
        Log.warn("AI monitor memberUpdate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("roleCreate", async (role): Promise<any> => {
    try {
        await aiMonitor.handleRoleCreate(role as any);
    } catch (error: any) {
        Log.warn("AI monitor roleCreate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("roleUpdate", async (oldRole, newRole): Promise<any> => {
    try {
        await aiMonitor.handleRoleUpdate(oldRole as any, newRole as any);
    } catch (error: any) {
        Log.warn("AI monitor roleUpdate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("roleDelete", async (role): Promise<any> => {
    try {
        await aiMonitor.handleRoleDelete(role as any);
    } catch (error: any) {
        Log.warn("AI monitor roleDelete failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("webhookUpdate", async (channel): Promise<any> => {
    try {
        await aiMonitor.handleWebhookUpdate(channel as any);
    } catch (error: any) {
        Log.warn("AI monitor webhookUpdate failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("guildBanAdd", async (ban): Promise<any> => {
    try {
        await aiMonitor.handleGuildBanAdd(ban.guild, ban.user);
    } catch (error: any) {
        Log.warn("AI monitor guildBanAdd failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("guildBanRemove", async (ban): Promise<any> => {
    try {
        await aiMonitor.handleGuildBanRemove(ban.guild, ban.user);
    } catch (error: any) {
        Log.warn("AI monitor guildBanRemove failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("messageDeleteBulk", async (messages): Promise<any> => {
    try {
        const first = messages.first();
        if (!first?.guild) return;
        await aiMonitor.handleMessageDeleteBulk(first.guild, first.channelId, messages.size);
    } catch (error: any) {
        Log.warn("AI monitor messageDeleteBulk failed", { component: "AiMonitor", error: error?.message || String(error) });
    }
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    const customResponses: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [message.guildId]);
    if (!customResponses[0]) return;
    for (const cr of customResponses) {
        let match = false;
        if (cr.is_regex) {
            try {
                match = new RegExp(cr.command, "i").test(message.content);
            } catch (error) {
                console.error("Error parsing regex:", error);
            }
        } else {
            match = message.content.toLowerCase() === cr.command.toLowerCase();
        }
        if (match) {
            await message.reply(cr.response);
            break;
        }
    }
});

client.on("interactionCreate", async (interaction): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(interaction.user.id)) return;
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en";
    let texts = {
        new: "🆕 **Welcome!** It looks like this is your first time using BarnieBot. Please take a moment to review our privacy policy here: ",
        error: "❌ **An error occurred** while processing your request. Please try again later. If the issue persists, contact support. -> ",
        loading: "⏳ **Loading...** Please wait while we translate texts.",
        not_vip: "⚠️ **VIP Access Required**: This feature is exclusive to VIP members. Consider upgrading to VIP for access.",
        expired_vip: "⏰ **VIP Expired**: Your VIP membership has expired. Renew your VIP status to continue enjoying exclusive benefits.",
        unread_notifications: "📬 **Hey!** You've got unread notifications waiting for you! Check them out with ",
        only_staff_email_send: "⚠️ **Access Denied**: Only staff members can authorize email sending.",
        email_send_cancelled: "❌ **Email Sending Cancelled**: Your email sending request has been cancelled.",
        email_send_confirmed: "✅ **Email Sent**: Your email has been successfully authorized and sent.",
    }
    if (Lang !== "en") {
        texts = await utils.autoTranslate(texts, "en", Lang);
    }
    if (interaction.isCommand()) {
        const cmd = data.bot.commands.get(interaction.commandName as string);
        if (!cmd) {
            return await interaction.reply({ content: "```\n" + `/${interaction.commandName}\n ${utils.createArrows(`${interaction.command?.name}`.length)}\n\nERR: Unknown slash command` + "\n```", ephemeral: true });
        }
        try {
            await interaction.reply({ content: data.bot.loadingEmoji.mention, flags: cmd.ephemeral ? MessageFlags.Ephemeral : undefined });
            await cmd.execute(interaction, Lang);
            await db.query("UPDATE executed_commands SET is_last = FALSE WHERE is_last = TRUE");
            await db.query("INSERT INTO executed_commands SET ?", [{ command: interaction.commandName, uid: interaction.user.id, at: Math.round(Date.now() / 1000) }]);
            const foundU: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [interaction.user.id]);
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [interaction.user.id]);
            if (foundVip[0] && foundVip[0].end_date <= Date.now()) {
                await db.query("DELETE FROM vip_users WHERE id = ?", [interaction.user.id]);
                await interaction.followUp({ content: texts.expired_vip, ephemeral: true });
            }

            const unreadNotifications = await utils.getUnreadNotifications(interaction.user.id);
            if (unreadNotifications.length > 0 && interaction.commandName !== "notifications") {
                await interaction.followUp({ content: texts.unread_notifications + "`/notifications`", ephemeral: true });
            }

            if (foundU[0]) {
                await db.query("UPDATE discord_users SET command_executions = command_executions + 1, pfp = ?, username = ? WHERE id = ?", [interaction.user.displayAvatarURL({ size: 1024 }), interaction.user.username, interaction.user.id]);
            }
            else {
                await db.query("INSERT INTO discord_users SET ?", { id: interaction.user.id, pfp: interaction.user.displayAvatarURL({ size: 1024 }), username: interaction.user.username });
                const msg = await interaction.followUp({ content: `<@${interaction.user.id}>, ${texts.new}: [privacy.txt](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.txt)`, ephemeral: true });
                await msg.removeAttachments();
            }
        }
        catch (err: any) {
            const errorId = `error_${interaction.commandName}_${Date.now()}`;
            const logDir = path.join(process.cwd(), "logs");
            try {
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
                const logPath = path.join(logDir, `${errorId}.log`);
                const logContents = [
                    `[Command Error Report]`,
                    `Timestamp: ${new Date().toISOString()}`,
                    `User: ${interaction.user.username} (${interaction.user.id})`,
                    `Command: /${interaction.commandName}`,
                    `Guild: ${interaction.guild?.name ?? "DM"} (${interaction.guild?.id ?? "none"})`,
                    `Interaction ID: ${interaction.id}`,
                    `Error Name: ${err?.name ?? "Unknown"}`,
                    `Error Message: ${err?.message ?? String(err)}`,
                    `Stack Trace:`,
                    `${err?.stack ?? "<no stack available>"}`
                ].join("\n");
                fs.writeFileSync(logPath, logContents);

                const errMessage = `⚠️ **Unexpected Error**\nYour request \`/${interaction.commandName}\` failed internally.\nReference: \
\`${errorId}\`\nA detailed log has been saved and attached. If this keeps happening, open \`/support\` and provide the reference ID.`;

                if (interaction.deferred || interaction.replied) {
                    try {
                        await interaction.editReply({ content: errMessage, files: [logPath] });
                    } catch (sendErr: any) {
                        try {
                            await interaction.followUp({ content: errMessage, files: [logPath], ephemeral: true });
                        } catch (followErr: any) {
                            await (interaction.channel as TextChannel)?.send(`<@${interaction.user.id}> ${texts.error} (Ref: ${errorId})`);
                            Log.warn("Failed to attach error log to interaction", { component: "ErrorHandler", reason: followErr?.message });
                        }
                    }
                } else {
                    try {
                        await interaction.reply({ content: errMessage, files: [logPath], ephemeral: true });
                    } catch (replyErr: any) {
                        try {
                            await interaction.followUp({ content: errMessage, files: [logPath], ephemeral: true });
                        } catch (followErr: any) {
                            await (interaction.channel as TextChannel)?.send(`<@${interaction.user.id}> ${texts.error} (Ref: ${errorId})`);
                            Log.warn("Failed to send error reply with log file", { component: "ErrorHandler", reason: followErr?.message });
                        }
                    }
                }
            } catch (fileErr: any) {
                Log.error("Failed to persist error log", new Error(fileErr?.message || String(fileErr)));
                try {
                    if (interaction.deferred || interaction.replied) await interaction.editReply(`${texts.error} (Failed to write log file)`);
                    else await interaction.reply({ content: `${texts.error} (Failed to write log file)`, ephemeral: true });
                } catch {}
            }
            Log.error("Slash command execution failed", new Error(`Error executing command ${cmd.data.name}`));
            console.error(err.stack, err);
        }
    }
    else if (interaction.isButton()) {
        try {
            const handled = await aiMonitor.handleButton(interaction);
            if (handled) return;
        } catch (error: any) {
            Log.warn("AI monitor button failed", { component: "AiMonitor", error: error?.message || String(error) });
        }
        const [event, ...args] = interaction.customId.trim().split("-");
        switch (event) {
            case "cancel_setup": {
                const [uid] = args;
                let text = {
                    value: "Alright, I've cancelled the setup.",
                    not_author: "You're not the person who ran the command originally."
                }
                if (Lang !== "en") {
                    text = await utils.autoTranslate(text, "en", Lang);
                }
                if (interaction.isRepliable() && uid !== interaction.user.id) return await interaction.reply({ content: text.not_author, ephemeral: true });
                if (interaction.isRepliable()) await interaction.deferUpdate();
                await interaction.message.edit({ components: [], content: text.value });
                break;
            }
            case "continue_setup": {
                const [uid] = args;
                const foundConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [interaction.guildId]);
                if (interaction.isRepliable() && uid !== interaction.user.id) return await interaction.reply({ content: "You're not the person who ran the command originally.", ephemeral: true });
                if (interaction.isRepliable()) await interaction.deferUpdate();
                const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
                const existing = filterSetupSessions.get(sessionKey);
                if (existing) filterSetupSessions.delete(sessionKey);
                const state: FilterSetupState = {
                    step: 0,
                    values: { enabled: false, logs_enabled: false, logs_channel: "0", lang: "en" },
                    messageId: interaction.message.id,
                    guildId: interaction.guildId!,
                    userId: interaction.user.id,
                    createdAt: Date.now()
                };
                filterSetupSessions.set(sessionKey, state);
                const steps = ["Enable filter", "Enable logging", "Set log channel", "Select language", "Finish"];
                const render = () => {
                    const progress = steps.map((s, i) => i === state.step ? `▶ ${s}` : `• ${s}`).join(" \n");
                    const channelName = state.values.logs_channel === "0" ? "Not set" : `#${interaction.guild?.channels.cache.get(state.values.logs_channel)?.name}`;
                    return "```\n" + `Setup Progress\n${progress}\n\nEnabled: ${state.values.enabled ? "Yes" : "No"}\nLogging: ${state.values.logs_enabled ? "Yes" : "No"}\nLog Channel: ${channelName}\nLanguage: ${state.values.lang}` + "\n```";
                };
                const buildComponents = (): ActionRowBuilder<ButtonBuilder>[] => {
                    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
                    const row1 = new ActionRowBuilder<ButtonBuilder>();
                    if (state.step === 0) {
                        row1.addComponents(
                            new ButtonBuilder().setCustomId("filtersetup_enable_yes").setLabel("Enable").setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId("filtersetup_enable_no").setLabel("Disable").setStyle(ButtonStyle.Secondary)
                        );
                    } else if (state.step === 1) {
                        row1.addComponents(
                            new ButtonBuilder().setCustomId("filtersetup_logs_yes").setLabel("Logging On").setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId("filtersetup_logs_no").setLabel("Logging Off").setStyle(ButtonStyle.Secondary)
                        );
                    } else if (state.step === 2) {
                        if (state.values.logs_enabled) {
                            row1.addComponents(
                                new ButtonBuilder().setCustomId("filtersetup_set_channel").setLabel("Set Channel").setStyle(ButtonStyle.Primary)
                            );
                        } else {
                            state.step = 3;
                            return buildComponents();
                        }
                    } else if (state.step === 3) {
                        const rowLangA = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId("filtersetup_lang_en").setLabel("English (en)").setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId("filtersetup_lang_es").setLabel("Spanish (es)").setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId("filtersetup_lang_fr").setLabel("French (fr)").setStyle(ButtonStyle.Primary)
                        );
                        const rowLangB = new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId("filtersetup_lang_de").setLabel("German (de)").setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId("filtersetup_lang_pt").setLabel("Portuguese (pt)").setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId("filtersetup_lang_it").setLabel("Italian (it)").setStyle(ButtonStyle.Primary)
                        );
                        rows.push(rowLangA, rowLangB);
                    } else if (state.step === 4) {
                        row1.addComponents(
                            new ButtonBuilder().setCustomId("filtersetup_finish").setLabel("Finish Setup").setStyle(ButtonStyle.Success)
                        );
                    }
                    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId("filtersetup_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger)
                    );
                    if (row1.components.length) rows.push(row1);
                    rows.push(controlRow);
                    return rows;
                };
                const embed = new EmbedBuilder().setTitle("Filter Setup Wizard").setColor("Purple").setDescription(render());
                (state as any).render = render;
                (state as any).buildComponents = buildComponents;
                await interaction.message.edit({ embeds: [embed], components: buildComponents(), content: "" });
                break;
            }
            case "filtersetup_cancel": {
                const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
                const state = filterSetupSessions.get(sessionKey);
                if (!state) { if (interaction.isRepliable()) await interaction.reply({ content: "No active setup.", ephemeral: true }); break; }
                filterSetupSessions.delete(sessionKey);
                if (interaction.isRepliable()) await interaction.deferUpdate();
                await interaction.message.edit({ components: [], content: "Setup cancelled." });
                break;
            }
            case "filtersetup_enable_yes":
            case "filtersetup_enable_no":
            case "filtersetup_logs_yes":
            case "filtersetup_logs_no":
            case "filtersetup_set_channel":
            case "filtersetup_finish":
            case "filtersetup_lang_en":
            case "filtersetup_lang_es":
            case "filtersetup_lang_fr":
            case "filtersetup_lang_de":
            case "filtersetup_lang_pt":
            case "filtersetup_lang_it": {
                const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
                const state = filterSetupSessions.get(sessionKey);
                if (!state) { if (interaction.isRepliable()) await interaction.reply({ content: "Setup expired. Run /filter setup again.", ephemeral: true }); break; }
                const now = Date.now();
                if (now - state.createdAt > 10 * 60 * 1000) {
                    filterSetupSessions.delete(sessionKey);
                    if (interaction.isRepliable()) await interaction.reply({ content: "Setup expired. Run /filter setup again.", ephemeral: true });
                    break;
                }
                if (interaction.customId === "filtersetup_enable_yes") state.values.enabled = true;
                else if (interaction.customId === "filtersetup_enable_no") state.values.enabled = false;
                else if (interaction.customId === "filtersetup_logs_yes") state.values.logs_enabled = true;
                else if (interaction.customId === "filtersetup_logs_no") state.values.logs_enabled = false;
                else if (interaction.customId.startsWith("filtersetup_lang_")) state.values.lang = interaction.customId.split("_").pop()!.toLowerCase();
                else if (interaction.customId === "filtersetup_set_channel") {
                    state.awaitingChannelMention = true;
                    if (interaction.isRepliable()) await interaction.reply({ content: "Mention the log channel now (you have 30s).", ephemeral: true });
                    const collector = (interaction.channel as TextChannel).createMessageCollector({ filter: m => m.author.id === interaction.user.id, time: 30000, max: 1 });
                    collector.on("collect", m => {
                        const mentioned = m.mentions.channels.first();
                        if (mentioned && mentioned.isTextBased()) {
                            state.values.logs_channel = mentioned.id;
                        }
                        void m.delete().catch(() => { });
                    });
                    collector.on("end", async () => {
                        state.awaitingChannelMention = false;
                        state.step = 3;
                        const embed = new EmbedBuilder().setTitle("Filter Setup Wizard").setColor("Purple").setDescription((state as any).render());
                        await interaction.message.edit({ embeds: [embed], components: (state as any).buildComponents() });
                    });
                    break;
                }
                if (interaction.customId === "filtersetup_finish") {
                    const existingRows: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [state.guildId]);
                    if (!existingRows[0]) await db.query("INSERT INTO filter_configs SET ?", [{
                        enabled: state.values.enabled,
                        guild: state.guildId,
                        log_channel: state.values.logs_channel,
                        enabled_logs: state.values.logs_enabled,
                        lang: state.values.lang
                    }]);
                    else await db.query("UPDATE filter_configs SET ? WHERE guild = ?", [{
                        enabled: state.values.enabled,
                        guild: state.guildId,
                        log_channel: state.values.logs_channel,
                        enabled_logs: state.values.logs_enabled,
                        lang: state.values.lang
                    }, state.guildId]);
                    filterSetupSessions.delete(sessionKey);
                    if (interaction.isRepliable()) await interaction.deferUpdate();
                    const doneEmbed = new EmbedBuilder().setTitle("Filter Setup Complete").setColor("Green").setDescription(`Enabled: ${state.values.enabled ? "Yes" : "No"}\nLogging: ${state.values.logs_enabled ? "Yes" : "No"}\nLog Channel: ${state.values.logs_channel === "0" ? "Not set" : `#${interaction.guild?.channels.cache.get(state.values.logs_channel)?.name}`}\nLanguage: ${state.values.lang}`);
                    await interaction.message.edit({ embeds: [doneEmbed], components: [] });
                    break;
                }
                if (!state.awaitingChannelMention) {
                    if (state.step === 0) state.step = 1;
                    else if (state.step === 1) state.step = 2;
                    else if (state.step === 2) state.step = 3;
                    else if (state.step === 3) state.step = 4;
                }
                if (interaction.isRepliable()) await interaction.deferUpdate();
                const embed = new EmbedBuilder().setTitle("Filter Setup Wizard").setColor("Purple").setDescription((state as any).render());
                await interaction.message.edit({ embeds: [embed], components: (state as any).buildComponents() });
                break;
            }
            case "staffcases": {
                const [action, authorId, targetUserId, pageStr] = args;
                if (authorId !== interaction.user.id) {
                    if (interaction.isRepliable()) await interaction.reply({ content: "You're not the requester of this view.", ephemeral: true });
                    return;
                }
                const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
                const PAGE_SIZE = 10;
                const offset = (page - 1) * PAGE_SIZE;
                const toSeconds = (val: any): number => {
                    if (val == null) return 0;
                    const n = typeof val === "string" ? parseInt(val, 10) : Number(val);
                    if (!isFinite(n)) return 0;
                    return n > 1_000_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
                };
                try {
                    const user = await client.users.fetch(targetUserId);
                    const warnCountRows: any = await db.query("SELECT COUNT(*) AS c FROM global_warnings WHERE userid = ?", [user.id]);
                    const warnCount = Array.isArray(warnCountRows) && warnCountRows.length ? (warnCountRows[0].c ?? 0) : 0;
                    const warns: any = await db.query(
                        "SELECT userid, authorid, reason, createdAt FROM global_warnings WHERE userid = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
                        [user.id, PAGE_SIZE, offset]
                    );
                    const bansRows: any = await db.query("SELECT active, times FROM global_bans WHERE id = ? LIMIT 1", [user.id]);
                    const ban = Array.isArray(bansRows) && bansRows.length ? bansRows[0] : null;
                    const muteRows: any = await db.query(
                        "SELECT reason, authorid, createdAt, until FROM global_mutes WHERE id = ? LIMIT 1",
                        [user.id]
                    );
                    const mute = Array.isArray(muteRows) && muteRows.length ? muteRows[0] : null;
                    const embed = new EmbedBuilder().setTitle(`Cases for ${user.username}`).setColor("Purple");
                    const blStatus = ban ? `${ban.active ? "Active" : "Inactive"}${typeof ban.times === "number" ? ` (times ${ban.times})` : ""}` : "None";
                    let muteStatus = "None";
                    if (mute) {
                        const untilSec = toSeconds(mute.until);
                        const nowSec = Math.floor(Date.now() / 1000);
                        const active = untilSec === 0 || untilSec > nowSec;
                        muteStatus = active
                            ? (untilSec === 0 ? "Active (indefinite)" : `Active until <t:${untilSec}:R>`) + (mute.reason ? ` — ${mute.reason}` : "")
                            : `Expired ${untilSec ? `<t:${untilSec}:R>` : ""}`;
                    }
                    embed.setDescription(`Blacklist: ${blStatus}\nMute: ${muteStatus}`);
                    let totalPages = 1;
                    if (warnCount === 0) {
                        embed.addFields({ name: "Warnings", value: "No warnings.", inline: false });
                    } else {
                        totalPages = Math.max(1, Math.ceil(warnCount / PAGE_SIZE));
                        const list = Array.isArray(warns) ? warns : [];
                        list.forEach((w: any, i: number) => {
                            const createdSec = toSeconds(w.createdAt);
                            const idx = offset + i + 1;
                            const header = `#${idx} • by <@${w.authorid || "unknown"}> • ${createdSec ? `<t:${createdSec}:R>` : ""}`;
                            const value = (w.reason && String(w.reason).trim().length) ? String(w.reason).slice(0, 1024) : "(no reason)";
                            embed.addFields({ name: header, value, inline: false });
                        });
                        embed.setFooter({ text: `Warnings ${Math.min(offset + 1, warnCount)}-${Math.min(offset + list.length, warnCount)} of ${warnCount} • Page ${page}/${totalPages}` });
                    }
                    const prev = new ButtonBuilder()
                        .setCustomId(`staffcases-prev-${authorId}-${user.id}-${Math.max(1, page - 1)}`)
                        .setLabel("Previous")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page <= 1);
                    const next = new ButtonBuilder()
                        .setCustomId(`staffcases-next-${authorId}-${user.id}-${Math.min(totalPages, page + 1)}`)
                        .setLabel("Next")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages);
                    const close = new ButtonBuilder()
                        .setCustomId(`staffcases-close-${authorId}`)
                        .setLabel("Close")
                        .setStyle(ButtonStyle.Danger);
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, close);
                    if (interaction.isRepliable()) await interaction.deferUpdate();
                    await interaction.message.edit({ embeds: [embed], components: [row] });
                } catch (_e) {
                    if (interaction.isRepliable()) await interaction.reply({ content: "Failed to update cases.", ephemeral: true });
                }
                break;
            }
            case "staffcases":
                break;
            case "close_ticket": {
                const [ticketIdStr, originalUserId] = args;
                const ticketId = parseInt(ticketIdStr);
                const isOwner = interaction.user.id === originalUserId;
                const staffRank = await utils.getUserStaffRank(interaction.user.id);
                const isStaff = staffRank !== null;

                if (!isOwner && !isStaff) {
                    if (interaction.isRepliable()) await interaction.reply({ content: "You don't have permission to close this ticket.", ephemeral: true });
                    return;
                }

                try {
                    const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
                    if (!ticketData[0]) {
                        if (interaction.isRepliable()) await interaction.reply({ content: "Ticket not found.", ephemeral: true });
                        return;
                    }

                    const ticket = ticketData[0];
                    if (ticket.status === "closed") {
                        if (interaction.isRepliable()) await interaction.reply({ content: "This ticket is already closed.", ephemeral: true });
                        return;
                    }

                    if (interaction.isRepliable()) {
                        const confirmEmbed = new EmbedBuilder()
                            .setColor("Orange")
                            .setTitle("⚠️ Confirm Ticket Closure")
                            .setDescription(`Are you sure you want to close ticket #${ticketId}?\n\nThis action will:\n• Generate and save transcripts\n• Notify the user\n• Mark the ticket as closed`)
                            .setFooter({ text: "Click confirm to proceed" });

                        const confirmRow = new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`confirm_close-${ticketId}-${originalUserId}`)
                                    .setLabel("Confirm Close")
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji("✅"),
                                new ButtonBuilder()
                                    .setCustomId(`cancel_close-${ticketId}`)
                                    .setLabel("Cancel")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setEmoji("❌")
                            );

                        await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
                    }
                } catch (error) {
                    console.error("Failed to show close confirmation:", error);
                    if (interaction.isRepliable()) await interaction.reply({ content: "Failed to process request.", ephemeral: true });
                }
                break;
            }
            case "cancel_close": {
                if (interaction.isRepliable()) {
                    await interaction.update({ content: "❌ Ticket closure cancelled.", embeds: [], components: [] });
                }
                break;
            }
            case "confirm_close": {
                const [ticketIdStr, originalUserId] = args;
                const ticketId = parseInt(ticketIdStr);

                try {
                    const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
                    if (!ticketData[0]) {
                        if (interaction.isRepliable()) await interaction.update({ content: "Ticket not found.", embeds: [], components: [] });
                        return;
                    }

                    const ticket = ticketData[0];
                    if (ticket.status === "closed") {
                        if (interaction.isRepliable()) await interaction.update({ content: "This ticket is already closed.", embeds: [], components: [] });
                        return;
                    }

                    if (interaction.isRepliable()) await interaction.update({ content: "🔄 Closing ticket and generating transcripts...", embeds: [], components: [] });

                    const messages: any = await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [ticketId]);
                    const user = await client.users.fetch(ticket.user_id);
                    const durationMs = Date.now() - ticket.created_at;
                    const hours = Math.floor(durationMs / 3600000);
                    const minutes = Math.floor((durationMs % 3600000) / 60000);
                    const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                    let textTranscript = `Support Ticket #${ticketId} - Transcript\n`;
                    textTranscript += `User: ${user.tag} (${user.id})\n`;
                    textTranscript += `Created: ${new Date(ticket.created_at).toISOString()}\n`;
                    textTranscript += `Closed: ${new Date().toISOString()}\n`;
                    textTranscript += `Duration: ${durationText}\n`;
                    textTranscript += `Closed by: ${interaction.user.tag} (${interaction.user.id})\n`;
                    textTranscript += `Origin: ${ticket.guild_id ? `Guild: ${ticket.guild_name} (${ticket.guild_id})` : "Direct Message"}\n`;
                    textTranscript += `Initial Message: ${ticket.initial_message}\n`;
                    textTranscript += `\n${"=".repeat(50)}\n\n`;

                    for (const msg of messages) {
                        const timestamp = new Date(msg.timestamp).toISOString();
                        if (msg.is_staff) {
                            const rankTag = utils.getRankSuffix(msg.staff_rank);
                            textTranscript += `[${timestamp}] [${rankTag}] ${msg.username}: ${msg.content}\n`;
                        } else {
                            textTranscript += `[${timestamp}] ${msg.username}: ${msg.content}\n`;
                        }
                    }

                    const fs = await import("fs");
                    let htmlTemplate = fs.readFileSync("./transcript_placeholder.html", "utf-8");

                    let messagesHtml = "";
                    for (const msg of messages) {
                        const timestamp = new Date(msg.timestamp).toLocaleString();
                        const initial = msg.username.charAt(0).toUpperCase();

                        if (msg.is_staff) {
                            const rankTag = utils.getRankSuffix(msg.staff_rank);
                            messagesHtml += `
                            <div class="message">
                                <div class="avatar">${initial}</div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="username">${msg.username}</span>
                                        <span class="staff-badge">${rankTag}</span>
                                        <span class="timestamp">${timestamp}</span>
                                    </div>
                                    <div class="message-text">${msg.content}</div>
                                </div>
                            </div>`;
                        } else {
                            messagesHtml += `
                            <div class="message">
                                <div class="avatar">${initial}</div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="username">${msg.username}</span>
                                        <span class="timestamp">${timestamp}</span>
                                    </div>
                                    <div class="message-text">${msg.content}</div>
                                </div>
                            </div>`;
                        }
                    }

                    htmlTemplate = htmlTemplate
                        .replace(/{ticketId}/g, ticketId.toString())
                        .replace(/{username}/g, user.tag)
                        .replace(/{userId}/g, user.id)
                        .replace(/{status}/g, "Closed")
                        .replace(/{statusClass}/g, "status-closed")
                        .replace(/{createdAt}/g, new Date(ticket.created_at).toLocaleString())
                        .replace(/{closedAt}/g, new Date().toLocaleString())
                        .replace(/{origin}/g, ticket.guild_id ? `Guild: ${ticket.guild_name} (${ticket.guild_id})` : "Direct Message")
                        .replace(/{initialMessage}/g, ticket.initial_message)
                        .replace(/{messages}/g, messagesHtml);

                    fs.writeFileSync(`./transcript-${ticketId}.txt`, textTranscript);
                    fs.writeFileSync(`./transcript-${ticketId}.html`, htmlTemplate);
                    const transcriptsChannel = await client.channels.fetch(data.bot.transcripts_channel) as TextChannel;
                    if (transcriptsChannel) {
                        const transcriptEmbed = new EmbedBuilder()
                            .setColor("Purple")
                            .setTitle(`🎫 Ticket #${ticketId} - Closed`)
                            .setDescription(`Ticket closed by ${interaction.user.tag}`)
                            .addFields(
                                { name: "User", value: `${user.tag} (${user.id})`, inline: true },
                                { name: "Messages", value: messages.length.toString(), inline: true },
                                { name: "Duration", value: durationText, inline: true }
                            )
                            .setTimestamp();

                        await transcriptsChannel.send({
                            embeds: [transcriptEmbed],
                            files: [
                                { attachment: `./transcript-${ticketId}.txt`, name: `transcript-${ticketId}.txt` },
                                { attachment: `./transcript-${ticketId}.html`, name: `transcript-${ticketId}.html` }
                            ]
                        });
                    }

                    const closedAt = Date.now();
                    await db.query("UPDATE support_tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?", [closedAt, interaction.user.id, ticketId]);
                    try {
                        const ticketChannel = await client.channels.fetch(ticket.channel_id) as TextChannel;
                        if (ticketChannel && ticket.message_id) {
                            const originalMessage = await ticketChannel.messages.fetch(ticket.message_id);
                            const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                                .setColor("Red")
                                .setTitle(`🔒 Ticket #${ticketId} - CLOSED`)
                                .setFields(
                                    originalMessage.embeds[0].fields.map(field => {
                                        if (field.name.toLowerCase().includes("status")) {
                                            return { name: field.name, value: "Closed", inline: field.inline };
                                        }
                                        return field;
                                    })
                                );

                            await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
                        }
                    } catch (error) {
                        console.error("Failed to update ticket embed:", error);
                    }

                    try {
                        const closedEmbed = new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("🔒 Support Ticket Closed")
                            .setDescription(`Your support ticket #${ticketId} has been closed by ${interaction.user.tag}.`)
                            .addFields(
                                { name: "Duration", value: durationText, inline: true },
                                { name: "Messages", value: messages.length.toString(), inline: true }
                            )
                            .setFooter({ text: "Thank you for contacting support!" })
                            .setTimestamp();

                        await user.send({ embeds: [closedEmbed] });
                    } catch (error) {
                        console.error("Failed to notify user of ticket closure:", error);
                    }

                    const ticketChannel = await client.channels.fetch(ticket.channel_id) as TextChannel;
                    if (ticketChannel) {
                        const closedNoticeEmbed = new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("🔒 Ticket Closed")
                            .setDescription(`This ticket has been closed by ${interaction.user.tag}.\n\nTranscripts have been saved and sent to <#${data.bot.transcripts_channel}>.\n\nYou can delete this channel using the button below.`)
                            .setTimestamp();

                        const deleteButton = new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`delete_channel-${ticketId}`)
                                    .setLabel("Delete Channel")
                                    .setStyle(ButtonStyle.Danger)
                                    .setEmoji("🗑️")
                            );

                        await ticketChannel.send({ embeds: [closedNoticeEmbed], components: [deleteButton] });
                    }

                    fs.unlinkSync(`./transcript-${ticketId}.txt`);
                    fs.unlinkSync(`./transcript-${ticketId}.html`);

                    try {
                        await interaction.editReply({ content: `✅ Ticket #${ticketId} has been closed successfully!` });
                    } catch (error) {
                        console.log("Could not update confirmation message:", error);
                    }

                } catch (error) {
                    console.error("Failed to close ticket:", error);
                    try {
                        await interaction.editReply({ content: "Failed to close ticket." });
                    } catch (e) {
                        console.error("Could not send error message:", e);
                    }
                }
                break;
            }
            case "delete_channel": {
                const [ticketIdStr] = args;
                const ticketId = parseInt(ticketIdStr);

                const staffRank = await utils.getUserStaffRank(interaction.user.id);
                if (!staffRank) {
                    if (interaction.isRepliable()) await interaction.reply({ content: "Only staff can delete ticket channels.", ephemeral: true });
                    return;
                }

                if (interaction.isRepliable()) {
                    const confirmEmbed = new EmbedBuilder()
                        .setColor("Orange")
                        .setTitle("⚠️ Confirm Channel Deletion")
                        .setDescription(`Are you sure you want to delete this ticket channel?\n\nThis action cannot be undone. The channel will be deleted in 5 seconds after confirmation.`)
                        .setFooter({ text: "Click confirm to proceed" });

                    const confirmRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_delete-${ticketId}`)
                                .setLabel("Confirm Delete")
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji("✅"),
                            new ButtonBuilder()
                                .setCustomId(`cancel_delete-${ticketId}`)
                                .setLabel("Cancel")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji("❌")
                        );

                    await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
                }
                break;
            }
            case "cancel_delete": {
                if (interaction.isRepliable()) {
                    await interaction.update({ content: "❌ Channel deletion cancelled.", embeds: [], components: [] });
                }
                break;
            }
            case "confirm_delete": {
                const [ticketIdStr] = args;

                try {
                    if (interaction.isRepliable()) {
                        await interaction.update({ content: "🗑️ Deleting channel in 5 seconds...", embeds: [], components: [] });
                    }

                    setTimeout(async () => {
                        try {
                            if (interaction.channel) {
                                await (interaction.channel as TextChannel).delete();
                            }
                        } catch (error) {
                            console.error("Failed to delete channel:", error);
                        }
                    }, 5000);
                } catch (error) {
                    console.error("Failed to confirm delete:", error);
                    if (interaction.isRepliable()) await interaction.editReply({ content: "Failed to delete channel." });
                }
                break;
            }
        }
        return;
    }
});

client.on("guildCreate", async (guild): Promise<any> => {
    const owner = await client.users.fetch(guild.ownerId);
    const embed = new EmbedBuilder()
        .setTitle("New guild")
        .setDescription(`Joined a new guild: ${guild.name} (${guild.id})`)
        .setColor("Purple")
        .setFooter({ text: `Owner: ${owner.username} (${owner.id})`, iconURL: owner.displayAvatarURL({ size: 1024 }) })
    const channel = client.channels.cache.get(data.bot.log_channel) as TextChannel;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
    Log.info("Guild joined", {
        component: "GuildSystem",
        guildName: guild.name,
        guildId: guild.id
    });
});

client.on("guildDelete", async (guild): Promise<any> => {
    const owner = await client.users.fetch(guild.ownerId);
    const embed = new EmbedBuilder()
        .setTitle("Left guild")
        .setDescription(`Left a guild: ${guild.name} (${guild.id})`)
        .setColor("Red")
        .setFooter({ text: `Owner: ${owner.username} (${owner.id})`, iconURL: owner.displayAvatarURL({ size: 1024 }) })
    const channel = client.channels.cache.get(data.bot.log_channel) as TextChannel;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
    Log.info("Guild left", {
        component: "GuildSystem",
        guildName: guild.name,
        guildId: guild.id
    });
    db.query("DELETE FROM filter_configs WHERE guild = ?", [guild.id]);
    db.query("DELETE FROM filter_words WHERE guild = ?", [guild.id]);
    Log.info("Filter configs deleted", {
        component: "FilterSystem",
        guildName: guild.name,
        guildId: guild.id
    });
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (!message.inGuild()) return;
    if (Number(process.env.INGORE_GLOBAL_CHAT) === 1) return;
    const chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [message.guildId]);
    if (!chatdb[0]) return;
    if (message.channelId !== chatdb[0].channel) return;
    const { author, channel, guild, content } = message;
    if (author.bot) return;

    const isGlobalCommand = await globalCommandsManager.processMessage(message, manager);
    if (isGlobalCommand) return;

    await manager.processUser(author);
    await manager.processMessage(message);
});

client.on("messageCreate", async (message): Promise<any> => {
    if (!message.inGuild()) return;
    if (message.author.bot) return;
    if (!message.channel.isTextBased()) return;
    let filterConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [message.guildId]);
    if (!filterConfig[0]) return;
    filterConfig = filterConfig[0];
    if (!Boolean(filterConfig.enabled)) return;
    const wordList: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [message.guildId]);
    if (!wordList.some((w: any) => message.content.toLowerCase().includes(w.content))) return;
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    const webHookData: any = await db.query("SELECT * FROM filter_webhooks WHERE channel = ?", [message.channel.id]);
    let webhook: any;
    if (webHookData[0]) {
        webhook = (await (message.channel as TextChannel).fetchWebhooks()).find((h: any) => h.id === webHookData[0].id);
    }
    else {
        webhook = await (message.channel as TextChannel).createWebhook({ name: "Filter Webhook", reason: "Filter webhook" });
        await db.query("INSERT INTO filter_webhooks SET ?", [{ id: webhook.id, token: webhook.token, channel: message.channel.id }]);
    }
    if (wordList.length < 1) { console.log("No words found."); return; }
    const badWords = wordList.filter((w: any) => message.content.toLowerCase().includes(w.content)).sort((w1: any, w2: any) => {
        if (w1.content.length > w2.content.length) return -1;
        else if (w2.content.length > w1.content.length) return 1;
        else return 0;
    });
    let content = message.content;
    if (badWords.length > 0) for (const word of badWords) {
        if (word.single) {
            content = content.trim().split(" ").map((w: string) => {
                if (new RegExp(`\\b${word.content}\\b`, "ig").test(w)) return `\`${utils.createCensored(word.content.length)}\``;
                return w;
            }).join(" ");
            continue;
        }
        const reg = new RegExp(word.content, "ig");
        content = content.replace(reg, `\`${utils.createCensored(word.content.length)}\``).replace(new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi), "[LINK]");
        continue;
    }
    if (content === message.content) return;
    const { author } = message;
    await message.delete();
    let reference: any;
    if (message.reference) reference = await message.fetchReference();
    const msg = await webhook.send({
        content: message.reference ? `> ${reference.content}\n<@${reference.author.id}> ${content}` : content,
        avatarURL: author.displayAvatarURL(),
        allowedMentions: { parse: [] },
        username: message.member?.nickname ?? author.displayName,
        files: message.attachments.map(a => a),
    });
    if (filterConfig.enabled_logs) {
        const channel = message.guild.channels.cache.get(filterConfig.log_channel) as TextChannel;
        if (!channel) return;
        let canSend = false;
        try {
            const tmpmsg = await channel.send(".");
            canSend = true;
            await tmpmsg.delete();
        }
        catch (e: any) {
            Log.warn("Filter log send failed", {
                component: "FilterSystem",
                guildName: message.guild.name
            });
        }
        if (canSend) {
            let texts = {
                title: "Filtered message",
                description: "A message from author r3tr0 has been filtered on xdss",
                original_content: "Original content",
                filtered: "Filtered words"
            };
            if (filterConfig.lang !== "en") {
                texts = await utils.autoTranslate(texts, "en", filterConfig.lang);
            }
            const embed = new EmbedBuilder()
                .setTitle(texts.title)
                .setDescription(texts.description.replace(new RegExp("r3tr0", "ig"), `<@${message.author.id}>`).replace(new RegExp("xdss", "ig"), `<#${message.channel.id}>`))
                .addFields(
                    {
                        name: texts.original_content,
                        value: message.content
                    },
                    {
                        name: texts.filtered,
                        value: badWords.map((w: any) => w.content).join(", ")
                    }
                )
                .setColor("Purple");
            await channel.send({ embeds: [embed] });
        }
    }
});

manager.on("limit-reached", async u => {
    const user = await client.users.fetch(u.uid);
    Log.info("User approaching to rate limit", {
        component: "RateLimit",
        username: user?.username,
        status: "warning"
    });
    await manager.announce(`User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets. Time remaining: ${u.time_left / 1000} seconds.`, "en");
});
manager.on("limit-exceed", async u => {
    const user = await client.users.fetch(u.uid);
    manager.ratelimit(u.uid, user?.username);
    Log.info("User rate limited", {
        component: "RateLimit",
        username: user?.username,
        duration: manager.options.ratelimit_time / 1000
    });
});

client.on("messageCreate", async (message): Promise<any> => {
    if (message.author.bot) return;
    if (message.guild && message.guild.id === data.bot.home_guild) {
        const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE channel_id = ? AND status = 'open'", [message.channelId]);
        if (ticketData[0]) {
            const ticket = ticketData[0];
            const staffRank = await utils.getUserStaffRank(message.author.id);
            if (staffRank) {
                const user = await client.users.fetch(ticket.user_id);
                const rankTag = utils.getRankSuffix(staffRank);
                const formattedMessage = `[${rankTag}] ${message.author.username}: ${message.content}`;
                try {
                    await user.send(formattedMessage);
                    if (!ticket.first_response_at) {
                        const responseTime = Date.now();
                        await db.query(
                            "UPDATE support_tickets SET first_response_at = ?, first_response_by = ? WHERE id = ?",
                            [responseTime, message.author.id, ticket.id]
                        );
                        const minutesToRespond = Math.floor((responseTime - ticket.created_at) / 60000);
                        const timeText = minutesToRespond < 60
                            ? `${minutesToRespond} minute(s)`
                            : `${Math.floor(minutesToRespond / 60)} hour(s) ${minutesToRespond % 60} minute(s)`;
                        await message.channel.send(`✅ First response logged: ${timeText} response time by ${message.author.tag}.`);
                    }
                    await db.query("INSERT INTO support_messages SET ?", [{
                        ticket_id: ticket.id,
                        user_id: message.author.id,
                        username: message.author.tag,
                        content: message.content,
                        timestamp: Date.now(),
                        is_staff: true,
                        staff_rank: staffRank
                    }]);
                } catch (error) {
                    await message.reply("⚠️ Failed to send message to user. They may have DMs disabled.");
                }
            }
        }
    }
    if (!message.guild) {
        const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1", [message.author.id]);
        if (ticketData[0]) {
            const ticket = ticketData[0];
            const ticketChannel = await client.channels.fetch(ticket.channel_id) as TextChannel;
            if (ticketChannel) {
                const formattedMessage = `\`${message.author.username}\`: ${message.content}`;
                try {
                    await ticketChannel.send(formattedMessage);
                    await db.query("INSERT INTO support_messages SET ?", [{
                        ticket_id: ticket.id,
                        user_id: message.author.id,
                        username: message.author.tag,
                        content: message.content,
                        timestamp: Date.now(),
                        is_staff: false,
                        staff_rank: null
                    }]);
                } catch (error) {
                    console.error("Failed to relay user message to ticket channel:", error);
                }
            }
        }
    }
});

client.login(data.bot.token);

export default client;
export { manager, globalCommandsManager };