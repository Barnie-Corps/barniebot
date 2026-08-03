import { Message } from "discord.js";
import client from "..";
import utils from "../utils";
import Log from "../Log";
import db from "../mysql/database";
import type { GlobalCommand } from "../types/globalCommands";

export default class GlobalCommandsManager {
    private commands: Map<string, GlobalCommand> = new Map();

    constructor() {
        this.loadCommands();
    }

    private loadCommands() {
        const commands = this.commands;

        commands.set("rules", {
            trigger: "rules",
            defaultLanguage: "en",
            description: "View global chat rules",
            usage: "b.rules [lang]",
            content: `**📜 Global Chat Rules**

1️⃣ **Be Respectful**: Treat all members with respect. No harassment, hate speech, or discrimination.

2️⃣ **No Spam**: Don't flood the chat with repeated messages, excessive caps, or unwanted content.

3️⃣ **Keep It Clean**: No NSFW content, gore, or disturbing material. This is a family-friendly space.

4️⃣ **No Self-Promotion**: Don't advertise servers, products, or social media without permission.

5️⃣ **Use Common Sense**: If something feels wrong, it probably is. Follow Discord's Terms of Service.

6️⃣ **No Doxxing**: Never share personal information about yourself or others.

7️⃣ **English in Global**: While translations are provided, try to keep primary messages understandable.

8️⃣ **No Raids or Brigading**: Don't coordinate attacks on other servers or users.

9️⃣ **Respect Staff**: Follow staff instructions. Don't argue with moderation decisions in public.

🔟 **No Impersonation**: Don't pretend to be staff members or other users.

⚠️ **Violations may result in warnings, mutes, or permanent bans from the global chat.**

*This global chat connects multiple Discord servers. Your messages are relayed across all connected guilds.*`
        });

        commands.set("help", {
            trigger: "help",
            defaultLanguage: "en",
            description: "Show this help message",
            usage: "b.help [lang]",
            handler: async () => {
                const lines = Array.from(commands.values())
                    .map(c => `\`${c.usage}\` — ${c.description}`)
                    .join("\n");
                return `**🤖 Global Chat Commands**

${lines}

All commands accept an optional language code, for example \`b.rules es\`.

**Example:** \`b.rules es\` for Spanish rules, \`b.help de\` for German help.

*This is a global chat connecting multiple Discord servers. Your messages are automatically translated and sent across all connected guilds.*`;
            }
        });

        commands.set("lang", {
            trigger: "lang",
            defaultLanguage: "en",
            description: "View or set your preferred language",
            usage: "b.lang [code]",
            dmOnly: true,
            handler: async (message, args) => {
                const requested = String(args[0] || "").toLowerCase();
                if (!requested) {
                    const current = await utils.getUserLanguage(message.author.id);
                    return `**🌐 Your Language**

Your current language is set to: \`${current}\`

Change it with \`b.lang <code>\` (e.g. \`b.lang es\`). Valid codes include \`es\`, \`fr\`, \`de\`, \`pt\`, \`ja\`, \`nl\`, \`it\`, \`ru\`, \`ko\`, \`zh\`, \`en\`.`;
                }
                if (!utils.isValidLanguageCode(requested)) {
                    return `**❌ Invalid Language Code**

\`${requested}\` is not a valid language code. Valid codes include \`es\`, \`fr\`, \`de\`, \`pt\`, \`ja\`, \`nl\`, \`it\`, \`ru\`, \`ko\`, \`zh\`, \`en\`.

View your current language with \`b.lang\`.`;
                }
                await db.query("INSERT INTO languages SET ? ON DUPLICATE KEY UPDATE lang = VALUES(lang)", [{ userid: message.author.id, lang: requested }]);
                utils.invalidateUserLanguageCache(message.author.id);
                return `**✅ Language Updated**

Your language has been set to: \`${requested}\`

Your global chat messages will be translated from this language, and automated messages will be sent to you in it.`;
            }
        });

        commands.set("stats", {
            trigger: "stats",
            defaultLanguage: "en",
            description: "View global chat statistics",
            usage: "b.stats",
            handler: async () => {
                const today = utils.getUtcDateKey();
                const [guildRows, messageRows, distinctRows, allTimeRows] = await Promise.all([
                    db.query("SELECT COUNT(*) AS cnt FROM globalchats WHERE enabled = TRUE"),
                    db.query("SELECT total FROM daily_metrics WHERE metric_date = ? AND metric_name = 'global_chat_messages'", [today]),
                    db.query("SELECT metric_name, COUNT(*) AS cnt FROM daily_distinct_metrics WHERE metric_date = ? AND metric_name IN ('active_users','active_guilds') GROUP BY metric_name", [today]),
                    db.query("SELECT COUNT(*) AS cnt FROM global_messages")
                ]) as unknown as [any[], any[], any[], any[]];
                const guildCount = Number(guildRows[0]?.cnt) || 0;
                const messagesToday = Number(messageRows[0]?.total) || 0;
                const activeUsers = Number(distinctRows.find((r: any) => r.metric_name === "active_users")?.cnt) || 0;
                const activeGuilds = Number(distinctRows.find((r: any) => r.metric_name === "active_guilds")?.cnt) || 0;
                const allTimeMessages = Number(allTimeRows[0]?.cnt) || 0;
                return `**📊 Global Chat Statistics**

**Connected Servers:** ${guildCount}
**Messages Today:** ${messagesToday}
**Active Users Today:** ${activeUsers}
**Active Servers Today:** ${activeGuilds}
**All-Time Messages:** ${allTimeMessages}

*Updated in real time.*`;
            }
        });

        commands.set("servers", {
            trigger: "servers",
            defaultLanguage: "en",
            description: "List servers connected to the global chat",
            usage: "b.servers",
            handler: async () => {
                const guildRows = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE") as unknown as any[];
                const lines: string[] = [];
                for (const g of guildRows) {
                    const guild = client.guilds.cache.get(g.guild);
                    if (!guild) continue;
                    lines.push(`**${guild.name}** — ${guild.memberCount.toLocaleString()} members${Number(g.autotranslate) === 1 ? " (auto-translate)" : ""}`);
                }
                const shown = lines.slice(0, 15).join("\n");
                const hiddenCount = lines.length - 15;
                const total = guildRows.length;
                let result = `**🌍 Connected Servers**\n\n${shown || "*No connected servers yet.*"}`;
                if (hiddenCount > 0) result += `\n*...and ${hiddenCount} more*`;
                result += `\n\n**Total connected servers: ${total}**`;
                return result;
            }
        });

        Log.info("Global commands loaded", {
            component: "GlobalCommandsManager",
            commandCount: this.commands.size
        });
    }

    public async processMessage(message: Message, manager: any): Promise<boolean> {
        const content = message.content.trim();

        if (!content.toLowerCase().startsWith("b.")) return false;

        const [rawCommand, ...args] = content.slice(2).trim().split(/\s+/);
        const command = rawCommand.toLowerCase();

        const globalCommand = this.commands.get(command);
        if (!globalCommand) return false;

        let targetLanguage = globalCommand.defaultLanguage;
        if (args.length > 0 && utils.isValidLanguageCode(args[0])) {
            targetLanguage = args[0].toLowerCase();
        }

        try {
            await manager.processUser(message.author);
            await manager.processMessage(message);

            const rawContent = globalCommand.handler
                ? await globalCommand.handler(message, args)
                : (globalCommand.content ?? "");

            let finalContent = rawContent;
            if (targetLanguage !== "en") {
                try {
                    const translated = await utils.translate(rawContent, "en", targetLanguage);
                    if (translated?.text) finalContent = translated.text;
                } catch { }
            }

            if (globalCommand.dmOnly) {
                const dm = await message.author.send(finalContent).catch(() => null);
                if (!dm) await message.reply({ content: finalContent }).catch(() => { });
            } else {
                setTimeout(async () => {
                    await manager.announce(finalContent, targetLanguage);
                }, 500);
            }

            Log.info("Global command executed", {
                component: "GlobalCommandsManager",
                command: globalCommand.trigger,
                language: targetLanguage,
                userId: message.author.id,
                username: message.author.username
            });

            return true;
        } catch (error: any) {
            Log.error("Failed to execute global command", new Error(
                `Command: ${globalCommand.trigger}, Language: ${targetLanguage}, Error: ${error.message}`
            ));
            return false;
        }
    }

    public getCommand(name: string): GlobalCommand | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): string[] {
        return Array.from(this.commands.keys());
    }
}
