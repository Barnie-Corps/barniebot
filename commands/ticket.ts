import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import { createLocalTicket, getLocalTicketByChannel, getLocalTicketConfig, canManageLocalTicket } from "../localTickets";

const parseRoleIds = (raw: string | null): string[] => {
    if (!raw) return [];
    const normalized = raw.trim().toLowerCase();
    if (!normalized || normalized === "none" || normalized === "clear") return [];
    return (raw.match(/\d{17,20}/g) || []).filter((value, index, array) => array.indexOf(value) === index);
};

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Guild-local ticket system")
        .addSubcommand(sub =>
            sub.setName("create")
                .setDescription("Create a local ticket in this server")
                .addStringOption(option =>
                    option.setName("message")
                        .setDescription("Describe your issue")
                        .setRequired(true)
                        .setMaxLength(1800)
                )
        )
        .addSubcommand(sub =>
            sub.setName("setup")
                .setDescription("Configure the local ticket system")
                .addChannelOption(option =>
                    option.setName("category")
                        .setDescription("Category where ticket channels will be created")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option.setName("transcripts_channel")
                        .setDescription("Channel where closed ticket transcripts will be sent")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName("support_roles")
                        .setDescription("Comma-separated role IDs or mentions that can manage tickets")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("status")
                .setDescription("View the local ticket configuration")
        )
        .addSubcommand(sub =>
            sub.setName("panel")
                .setDescription("Post a ticket panel in a channel")
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("Channel where the panel should be posted")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("disable")
                .setDescription("Disable the local ticket system")
        )
        .addSubcommand(sub =>
            sub.setName("close")
                .setDescription("Close the current local ticket channel")
        ),
    category: "Support",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            guild_only: "This command can only be used in a server.",
            admin_only: "You need the `Administrator` permission to do that.",
            support_only: "You do not have permission to manage this local ticket.",
            setup_done: "Local ticket system configured.",
            disabled: "Local ticket system disabled.",
            not_configured: "Local ticket system is not configured for this server.",
            not_enabled: "Local ticket system is disabled for this server.",
            created: "Your local ticket has been created.",
            create_failed: "Failed to create the local ticket.",
            already_open: "You already have an open local ticket:",
            invalid_roles: "One or more support roles are invalid for this server.",
            invalid_category: "The configured ticket category is invalid.",
            panel_posted: "Ticket panel posted successfully.",
            panel_title: "Support Tickets",
            panel_description: "Press the button below to open a private support ticket.",
            panel_button: "Open Ticket",
            status_title: "Local Ticket Status",
            ticket_title: "Ticket",
            ticket_user: "User",
            ticket_status: "Status",
            ticket_open: "Open",
            ticket_close_button: "Close Ticket",
            category: "Category",
            transcripts: "Transcripts",
            support_roles: "Support Roles",
            enabled: "Enabled",
            disabled_value: "Disabled",
            none: "Not set",
            not_ticket_channel: "This channel is not an open local ticket.",
            close_confirm: "Confirm Close",
            close_prompt: "Press the button below to close this ticket.",
            close_requested: "Local ticket close requested."
        };
        if (lang !== "en") texts = await utils.autoTranslate(texts, "en", lang);
        if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) return await utils.safeInteractionRespond(interaction, texts.guild_only);
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "setup" || subcommand === "disable" || subcommand === "status" || subcommand === "panel") {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                return await utils.safeInteractionRespond(interaction, texts.admin_only);
            }
        }
        switch (subcommand) {
            case "setup": {
                const category = interaction.options.getChannel("category", true);
                const transcriptsChannel = interaction.options.getChannel("transcripts_channel");
                const supportRoles = parseRoleIds(interaction.options.getString("support_roles"));
                if (supportRoles.some(roleId => !interaction.guild!.roles.cache.has(roleId))) {
                    return await utils.safeInteractionRespond(interaction, texts.invalid_roles);
                }
                const existing = await db.query("SELECT * FROM local_ticket_configs WHERE guild_id = ?", [interaction.guildId]) as unknown as any[];
                const now = Date.now();
                if (existing?.[0]) {
                    await db.query(
                        "UPDATE local_ticket_configs SET enabled = TRUE, category_id = ?, transcripts_channel_id = ?, support_role_ids = ?, updated_at = ? WHERE guild_id = ?",
                        [category.id, transcriptsChannel?.id ?? null, JSON.stringify(supportRoles), now, interaction.guildId]
                    );
                } else {
                    await db.query("INSERT INTO local_ticket_configs SET ?", [{
                        guild_id: interaction.guildId,
                        enabled: true,
                        category_id: category.id,
                        transcripts_channel_id: transcriptsChannel?.id ?? null,
                        support_role_ids: JSON.stringify(supportRoles),
                        created_at: now,
                        updated_at: now
                    }]);
                }
                return await utils.safeInteractionRespond(interaction, texts.setup_done);
            }
            case "status": {
                const config = await getLocalTicketConfig(interaction.guildId);
                if (!config) return await utils.safeInteractionRespond(interaction, texts.not_configured);
                const embed = new EmbedBuilder()
                    .setColor(config.enabled ? "Green" : "Red")
                    .setTitle(texts.status_title)
                    .addFields(
                        { name: texts.enabled, value: config.enabled ? texts.enabled : texts.disabled_value, inline: true },
                        { name: texts.category, value: config.category_id ? `<#${config.category_id}>` : texts.none, inline: true },
                        { name: texts.transcripts, value: config.transcripts_channel_id ? `<#${config.transcripts_channel_id}>` : texts.none, inline: true },
                        { name: texts.support_roles, value: config.support_role_ids.length ? config.support_role_ids.map(roleId => `<@&${roleId}>`).join(", ") : texts.none, inline: false }
                );
                return await utils.safeInteractionRespond(interaction, { embeds: [embed] });
            }
            case "panel": {
                const config = await getLocalTicketConfig(interaction.guildId);
                if (!config) return await utils.safeInteractionRespond(interaction, texts.not_configured);
                if (!config.enabled) return await utils.safeInteractionRespond(interaction, texts.not_enabled);
                const channel = interaction.options.getChannel("channel", true) as any;
                const embed = new EmbedBuilder()
                    .setColor("Blue")
                    .setTitle(texts.panel_title)
                    .setDescription(texts.panel_description);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId("localticket_openpanel")
                        .setLabel(texts.panel_button)
                        .setStyle(ButtonStyle.Primary)
                );
                await channel.send({ embeds: [embed], components: [row] });
                return await utils.safeInteractionRespond(interaction, texts.panel_posted);
            }
            case "disable": {
                const existing = await db.query("SELECT * FROM local_ticket_configs WHERE guild_id = ?", [interaction.guildId]) as unknown as any[];
                if (!existing?.[0]) return await utils.safeInteractionRespond(interaction, texts.not_configured);
                await db.query("UPDATE local_ticket_configs SET enabled = FALSE, updated_at = ? WHERE guild_id = ?", [Date.now(), interaction.guildId]);
                return await utils.safeInteractionRespond(interaction, texts.disabled);
            }
            case "create": {
                const config = await getLocalTicketConfig(interaction.guildId);
                if (!config) return await utils.safeInteractionRespond(interaction, texts.not_configured);
                if (!config.enabled) return await utils.safeInteractionRespond(interaction, texts.not_enabled);
                const result = await createLocalTicket(interaction.guildId, interaction.user.id, interaction.options.getString("message", true).trim(), {
                    title: texts.ticket_title,
                    user: texts.ticket_user,
                    status: texts.ticket_status,
                    open: texts.ticket_open,
                    close_button: texts.ticket_close_button,
                    not_enabled_error: texts.not_enabled,
                    invalid_category_error: texts.invalid_category,
                    already_open_error: texts.already_open
                });
                if ((result as any).ticket) {
                    return await utils.safeInteractionRespond(interaction, `${texts.already_open} <#${(result as any).ticket.channel_id}>`);
                }
                if (!(result as any).success) {
                    return await utils.safeInteractionRespond(interaction, (result as any).error ?? texts.create_failed);
                }
                return await utils.safeInteractionRespond(interaction, `${texts.created} <#${(result as any).channelId}>`);
            }
            case "close": {
                const ticket = await getLocalTicketByChannel(interaction.channelId);
                if (!ticket || ticket.status !== "open") return await utils.safeInteractionRespond(interaction, texts.not_ticket_channel);
                const config = await getLocalTicketConfig(interaction.guildId);
                const member = interaction.member as any;
                if (!canManageLocalTicket(member, ticket, config)) return await utils.safeInteractionRespond(interaction, texts.support_only);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`localticket_close-${ticket.id}-${ticket.creator_id}`)
                        .setLabel(texts.close_confirm)
                        .setStyle(ButtonStyle.Danger)
                );
                return await utils.safeInteractionRespond(interaction, { content: texts.close_prompt, components: [row], ephemeral: true });
            }
        }
    }
};
