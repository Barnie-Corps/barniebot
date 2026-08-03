import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("automod")
        .setDescription("Configure auto-moderation")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName("view").setDescription("View current auto-mod settings"))
        .addSubcommand(s =>
            s.setName("toggle")
                .setDescription("Enable/disable auto-mod rules")
                .addStringOption(o =>
                    o.setName("rule")
                        .setDescription("Rule to toggle")
                        .setRequired(true)
                        .addChoices(
                            { name: "All", value: "all" },
                            { name: "Spam", value: "spam" },
                            { name: "Excessive Caps", value: "caps" },
                            { name: "Mass Mentions", value: "mention" },
                            { name: "Invite Links", value: "invite" }
                        )
                )
                .addBooleanOption(o => o.setName("enabled").setDescription("Enable or disable").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("action")
                .setDescription("Set the action taken on rule violation")
                .addStringOption(o =>
                    o.setName("action")
                        .setDescription("Action to take")
                        .setRequired(true)
                        .addChoices(
                            { name: "Delete message", value: "delete" },
                            { name: "Warn user", value: "warn" },
                            { name: "Delete and warn", value: "delete_warn" }
                        )
                )
        ),
    category: "Moderation",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            view_title: "Auto-Mod Configuration",
            enabled: "Enabled",
            disabled: "Disabled",
            rule: "Rule",
            status: "Status",
            spam: "Spam Protection",
            caps: "Excessive Caps",
            mentions: "Mass Mentions",
            invites: "Invite Links",
            action: "Action on violation",
            toggled: "Rule toggled successfully",
            action_set: "Action set successfully",
            no_guild: "This command can only be used in a server."
        };
        if (lang !== "en") {
            try { texts = await utils.autoTranslate(texts, "en", lang); } catch {}
        }
        if (!interaction.guildId) {
            return utils.safeInteractionRespond(interaction, { content: texts.no_guild, ephemeral: true });
        }
        const guildId = interaction.guildId;
        const sub = interaction.options.getSubcommand();
        if (sub === "view") {
            const rows = await db.query("SELECT * FROM automod_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
            const config = rows[0];
            const yes = `✅ ${texts.enabled}`;
            const no = `❌ ${texts.disabled}`;
            const embed = new EmbedBuilder()
                .setColor("Blue")
                .setTitle(texts.view_title)
                .addFields(
                    { name: texts.spam, value: config ? (config.spam_enabled ? yes : no) : no, inline: true },
                    { name: texts.caps, value: config ? (config.caps_enabled ? yes : no) : no, inline: true },
                    { name: texts.mentions, value: config ? (config.mention_enabled ? yes : no) : no, inline: true },
                    { name: texts.invites, value: config ? (config.invite_enabled ? yes : no) : no, inline: true },
                    { name: texts.action, value: config ? `\`${config.action}\`` : "`delete`", inline: false }
                )
                .setTimestamp();
            return utils.safeInteractionRespond(interaction, { embeds: [embed], ephemeral: true });
        }
        if (sub === "toggle") {
            const rule = interaction.options.getString("rule", true);
            const enabled = interaction.options.getBoolean("enabled", true);
            const now = Date.now();
            const existing = await db.query("SELECT * FROM automod_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
            if (!existing[0]) {
                await db.query("INSERT INTO automod_configs SET ?", [{
                    guild_id: guildId, enabled: true, created_at: now, updated_at: now
                }]);
            }
            const updates: Record<string, any> = { updated_at: now };
            if (rule === "all") updates.enabled = enabled;
            else if (rule === "spam") updates.spam_enabled = enabled;
            else if (rule === "caps") updates.caps_enabled = enabled;
            else if (rule === "mention") updates.mention_enabled = enabled;
            else if (rule === "invite") updates.invite_enabled = enabled;
            else {
                if (enabled) updates.enabled = true;
                updates[`${rule}_enabled`] = enabled;
            }
            await db.query("UPDATE automod_configs SET ? WHERE guild_id = ?", [updates, guildId]);
            return utils.safeInteractionRespond(interaction, { content: texts.toggled, ephemeral: true });
        }
        if (sub === "action") {
            const action = interaction.options.getString("action", true);
            const now = Date.now();
            const existing = await db.query("SELECT * FROM automod_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
            if (!existing[0]) {
                await db.query("INSERT INTO automod_configs SET ?", [{
                    guild_id: guildId, enabled: true, created_at: now, updated_at: now
                }]);
            }
            await db.query("UPDATE automod_configs SET action = ?, updated_at = ? WHERE guild_id = ?", [action, now, guildId]);
            return utils.safeInteractionRespond(interaction, { content: texts.action_set, ephemeral: true });
        }
    },
    ephemeral: true
};
