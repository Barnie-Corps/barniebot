import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, TextChannel } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Configure welcome/goodbye messages")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName("channel")
                .setDescription("Set the welcome/goodbye channel")
                .addChannelOption(o => o.setName("channel").setDescription("The channel for messages").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("message")
                .setDescription("Set the welcome or goodbye message")
                .addStringOption(o =>
                    o.setName("type")
                        .setDescription("Which message to set")
                        .setRequired(true)
                        .addChoices({ name: "Welcome", value: "welcome" }, { name: "Goodbye", value: "goodbye" })
                )
                .addStringOption(o => o.setName("text").setDescription("Message text. Use {user} and {server} as placeholders").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("toggle")
                .setDescription("Enable/disable welcome/goodbye")
                .addStringOption(o =>
                    o.setName("type")
                        .setDescription("Which to toggle")
                        .setRequired(true)
                        .addChoices({ name: "Both", value: "both" }, { name: "Welcome", value: "welcome" }, { name: "Goodbye", value: "goodbye" })
                )
                .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("test")
                .setDescription("Test the welcome/goodbye message")
                .addStringOption(o =>
                    o.setName("type")
                        .setDescription("Which message to test")
                        .setRequired(true)
                        .addChoices({ name: "Welcome", value: "welcome" }, { name: "Goodbye", value: "goodbye" })
                )
        ),
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            no_guild: "This command can only be used in a server.",
            set_channel: "Welcome/goodbye channel set to",
            set_message: "message set successfully.",
            toggled: "toggled successfully.",
            test_sent: "Test message sent to",
            variables: "Available variables: `{user}` - user mention, `{username}` - username, `{server}` - server name, `{count}` - member count",
            welcome_label: "Welcome",
            goodbye_label: "Goodbye",
            both_label: "Both",
            enabled: "Enabled",
            disabled: "Disabled",
            current_config: "Current Welcome/Goodbye Configuration"
        };
        if (lang !== "en") {
            try { texts = await utils.autoTranslate(texts, "en", lang); } catch {}
        }
        if (!interaction.guildId) {
            return utils.safeInteractionRespond(interaction, { content: texts.no_guild, ephemeral: true });
        }
        const guildId = interaction.guildId;
        const sub = interaction.options.getSubcommand();
        const now = Date.now();
        if (sub === "channel") {
            const channel = interaction.options.getChannel("channel", true);
            await upsertConfig(guildId, { channel_id: channel.id, updated_at: now });
            return utils.safeInteractionRespond(interaction, { content: `${texts.set_channel} <#${channel.id}>`, ephemeral: true });
        }
        if (sub === "message") {
            const type = interaction.options.getString("type", true);
            const text = interaction.options.getString("text", true);
            const field = type === "welcome" ? "welcome_message" : "goodbye_message";
            await upsertConfig(guildId, { [field]: text, updated_at: now });
            return utils.safeInteractionRespond(interaction, { content: `${type} ${texts.set_message}\n${texts.variables}`, ephemeral: true });
        }
        if (sub === "toggle") {
            const type = interaction.options.getString("type", true);
            const enabled = interaction.options.getBoolean("enabled", true);
            const updates: Record<string, any> = { updated_at: now };
            if (type === "both") { updates.welcome_enabled = enabled; updates.goodbye_enabled = enabled; }
            else if (type === "welcome") updates.welcome_enabled = enabled;
            else updates.goodbye_enabled = enabled;
            await upsertConfig(guildId, updates);
            const label = type === "both" ? texts.both_label : type === "welcome" ? texts.welcome_label : texts.goodbye_label;
            return utils.safeInteractionRespond(interaction, { content: `${label} ${texts.toggled} (${enabled ? texts.enabled : texts.disabled})`, ephemeral: true });
        }
        if (sub === "test") {
            const type = interaction.options.getString("type", true);
            const rows = await db.query("SELECT * FROM welcome_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
            const config = rows[0];
            if (!config || config.channel_id === "0") {
                return utils.safeInteractionRespond(interaction, { content: "Please set a channel first using `/welcome channel`.", ephemeral: true });
            }
            const channel = interaction.guild?.channels.cache.get(config.channel_id) as TextChannel;
            if (!channel) {
                return utils.safeInteractionRespond(interaction, { content: "Configured channel not found. Set a new one with `/welcome channel`.", ephemeral: true });
            }
            const member = interaction.member as any;
            const msg = type === "welcome" ? config.welcome_message : config.goodbye_message;
            const formatted = formatMessage(msg, member.user?.id || "User", member.user?.username || "User", member.displayName || "User", interaction.guild?.name || "Server", interaction.guild?.memberCount || 0);
            await channel.send(formatted);
            return utils.safeInteractionRespond(interaction, { content: `${texts.test_sent} <#${config.channel_id}>`, ephemeral: true });
        }
    },
    ephemeral: true
};

async function upsertConfig(guildId: string, updates: Record<string, any>) {
    const existing = await db.query("SELECT * FROM welcome_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
    if (!existing[0]) {
        await db.query("INSERT INTO welcome_configs SET ?", [{
            guild_id: guildId, enabled: true, channel_id: "0",
            created_at: Date.now(), updated_at: Date.now(), ...updates
        }]);
    } else {
        await db.query("UPDATE welcome_configs SET ? WHERE guild_id = ?", [updates, guildId]);
    }
}

function formatMessage(msg: string, userId: string, username: string, displayName: string, server: string, count: number): string {
    return msg
        .replace(/\{user\}/g, `<@${userId}>`)
        .replace(/\{username\}/g, username)
        .replace(/\{displayname\}/g, displayName)
        .replace(/\{server\}/g, server)
        .replace(/\{count\}/g, String(count));
}

export { formatMessage, upsertConfig };
