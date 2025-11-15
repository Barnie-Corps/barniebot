import { Message } from "discord.js";
import utils from "../utils";
import Log from "../Log";

interface GlobalCommand {
    trigger: string;
    requiresLanguage: boolean;
    defaultLanguage: string;
    content: string;
}

export default class GlobalCommandsManager {
    private commands: Map<string, GlobalCommand> = new Map();

    constructor() {
        this.loadCommands();
    }

    private loadCommands() {
        // Rules command with multi-language support
        this.commands.set("rules", {
            trigger: "rules",
            requiresLanguage: true,
            defaultLanguage: "en",
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

        // Help command
        this.commands.set("help", {
            trigger: "help",
            requiresLanguage: false,
            defaultLanguage: "en",
            content: `**🤖 Global Chat Commands**

\`b.rules [language]\` - View global chat rules
\`b.help\` - Show this help message

**Available Languages:**
You can request rules in any language code (e.g., \`es\`, \`fr\`, \`de\`, \`pt\`, \`ja\`, etc.)

**Example:** \`b.rules es\` for Spanish rules

*This is a global chat connecting multiple Discord servers. Your messages are automatically translated and sent across all connected guilds.*`
        });

        Log.info("Global commands loaded", { 
            component: "GlobalCommandsManager",
            commandCount: this.commands.size 
        });
    }

    public async processMessage(message: Message, manager: any): Promise<boolean> {
        const content = message.content.trim();
        
        // Check if message starts with b. prefix
        if (!content.toLowerCase().startsWith("b.")) return false;

        const [rawCommand, ...args] = content.slice(2).trim().split(/\s+/);
        const command = rawCommand.toLowerCase();

        const globalCommand = this.commands.get(command);
        if (!globalCommand) return false;

        // Determine target language
        let targetLanguage = globalCommand.defaultLanguage;
        
        if (globalCommand.requiresLanguage && args.length > 0) {
            const requestedLang = args[0].toLowerCase();
            // Accept any language code provided by user
            if (requestedLang && requestedLang.length >= 2) {
                targetLanguage = requestedLang;
            }
        }

        // Get content - translate if not English
        let contentToSend = globalCommand.content;
        
        if (targetLanguage !== "en") {
            try {
                const translationResult = await utils.translate(
                    globalCommand.content,
                    "en",
                    targetLanguage
                );
                contentToSend = translationResult.text || globalCommand.content;
            } catch (error: any) {
                Log.warn("Failed to translate global command", {
                    component: "GlobalCommandsManager",
                    command: globalCommand.trigger,
                    targetLanguage,
                    error: error.message
                });
                // Fallback to English on translation error
                contentToSend = globalCommand.content;
            }
        }

        // Send via ChatManager's announce method
        try {
            // FIRST: Relay the user's command message to global chat
            await manager.processUser(message.author);
            await manager.processMessage(message);
            
            // SECOND: Send the bot's response after a brief delay
            setTimeout(async () => {
                await manager.announce(contentToSend, targetLanguage);
            }, 500);
            
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
