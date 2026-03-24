import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import data from "../data";
import client from "..";

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Create a support ticket")
        .addStringOption(o => o.setName("message").setDescription("Describe your issue or question").setRequired(true).setMaxLength(1800)),
    category: "Support",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            creating: "Creating your support ticket...",
            created: "Your support ticket has been created! Our staff will respond soon.",
            error: "Failed to create support ticket. Please try again later.",
            guild_permission_required: "You need the `Manage Messages` permission to use this command in a server. Try using it in DMs instead.",
            guild_warning: "Support ticket created. Please note that staff responses will be visible in this channel.",
            no_home_guild: "Support system is not properly configured.",
            invalid_message: "Please provide a valid support message.",
            ticket_info: "Ticket Information",
            user: "User",
            ticket_id: "Ticket ID",
            created_at: "Created At",
            initial_message: "Initial Message",
            origin: "Origin",
            dm_origin: "Direct Message",
            guild_origin: "Guild",
            status: "Status",
            open: "Open",
            assigned_to: "Assigned To",
            unassigned: "Unassigned",
            close_ticket: "Close Ticket",
            new_ticket_assigned: "New ticket assigned to you!",
            new_ticket_unassigned: "New unassigned ticket!",
            ticket_created_title: "Support Ticket Created",
            ticket_created_description: "Your support ticket #{ticketId} has been created!\n\nOur staff will respond to you soon. You can close this ticket at any time using the button below.",
            all_messages_forwarded: "All messages you send here will be forwarded to staff"
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        if (interaction.guild && interaction.member) {
            const member = interaction.member as any;
            if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return await utils.safeInteractionRespond(interaction, texts.guild_permission_required);
            }
        }

        const message = interaction.options.getString("message", true).trim();
        if (!message.length) return await utils.safeInteractionRespond(interaction, texts.invalid_message);
        const isDM = !interaction.guild;

        try {
            await utils.safeInteractionRespond(interaction, texts.creating);
            const homeGuild = await client.guilds.fetch(data.bot.home_guild);
            if (!homeGuild) {
                return await utils.safeInteractionRespond(interaction, texts.no_home_guild);
            }

            const category = homeGuild.channels.cache.get(data.bot.support_category);
            if (!category || category.type !== ChannelType.GuildCategory) {
                return await utils.safeInteractionRespond(interaction, texts.no_home_guild);
            }

            let assignedStaff: string | null = null;
            try {
                const staffRows = await db.query("SELECT uid FROM staff") as unknown as Array<{ uid: string }>;
                const staffIds = staffRows.map(row => row.uid);
                const statuses: any = await db.query(
                    "SELECT user_id, status FROM staff_status WHERE user_id IN (?) AND status = 'available'",
                    [staffIds.length > 0 ? staffIds : ["none"]]
                );
                const availableStaffIds = statuses.map((s: any) => s.user_id);
                if (availableStaffIds.length > 0) {
                    const workloads: any = await db.query(
                        "SELECT assigned_to, COUNT(*) as count FROM support_tickets WHERE assigned_to IN (?) AND status = 'open' GROUP BY assigned_to",
                        [availableStaffIds]
                    );
                    const workloadMap = new Map<string, number>();
                    workloads.forEach((w: any) => workloadMap.set(w.assigned_to, w.count));
                    let minWorkload = Infinity;
                    for (const staffId of availableStaffIds) {
                        const workload = workloadMap.get(staffId) || 0;
                        if (workload < minWorkload) {
                            minWorkload = workload;
                            assignedStaff = staffId;
                        }
                    }
                }
            } catch (error) {
                console.error("Auto-assignment failed:", error);
            }

            const createdAt = Date.now();
            const result: any = await db.query(
                "INSERT INTO support_tickets SET ?",
                [{
                    user_id: interaction.user.id,
                    channel_id: "pending",
                    status: "open",
                    created_at: createdAt,
                    initial_message: message,
                    guild_id: interaction.guild?.id || null,
                    guild_name: interaction.guild?.name || null,
                    assigned_to: assignedStaff
                }]
            );

            const ticketId = result.insertId;
            const ticketChannel = await homeGuild.channels.create({
                name: `support-request-${ticketId}`,
                type: ChannelType.GuildText,
                parent: data.bot.support_category,
                topic: `Support ticket #${ticketId} - User: ${interaction.user.tag} (${interaction.user.id})`
            });

            await db.query("UPDATE support_tickets SET channel_id = ? WHERE id = ?", [ticketChannel.id, ticketId]);

            const ticketEmbed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle(`${texts.ticket_info} #${ticketId}`)
                .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: texts.user, value: `${interaction.user.tag} (<@${interaction.user.id}>)\nID: ${interaction.user.id}`, inline: false },
                    { name: texts.ticket_id, value: `#${ticketId}`, inline: true },
                    { name: texts.status, value: texts.open, inline: true },
                    { name: texts.assigned_to, value: assignedStaff ? `<@${assignedStaff}>` : texts.unassigned, inline: true },
                    { name: texts.created_at, value: `<t:${Math.floor(createdAt / 1000)}:F>`, inline: false },
                    { name: texts.origin, value: isDM ? texts.dm_origin : `${texts.guild_origin}: ${interaction.guild!.name} (${interaction.guild!.id})`, inline: false },
                    { name: texts.initial_message, value: message.length > 1024 ? message.substring(0, 1021) + "..." : message, inline: false }
                )
                .setFooter({ text: `User ID: ${interaction.user.id}` })
                .setTimestamp();

            const closeButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`close_ticket-${ticketId}-${interaction.user.id}`)
                        .setLabel(texts.close_ticket)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            const ticketMessage = await ticketChannel.send({
                content: assignedStaff ? `<@${assignedStaff}> - ${texts.new_ticket_assigned}` : texts.new_ticket_unassigned,
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            const userCloseEmbed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle(`🎫 ${texts.ticket_created_title}`)
                .setDescription(texts.ticket_created_description.replace("#{ticketId}", `#${ticketId}`))
                .addFields(
                    { name: texts.ticket_id, value: `#${ticketId}`, inline: true },
                    { name: texts.status, value: texts.open, inline: true }
                )
                .setFooter({ text: texts.all_messages_forwarded })
                .setTimestamp();

            const userCloseButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`close_ticket-${ticketId}-${interaction.user.id}`)
                        .setLabel(texts.close_ticket)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            try {
                await interaction.user.send({ embeds: [userCloseEmbed], components: [userCloseButton] });
            } catch (error) {
                console.error("Failed to send close option to user:", error);
            }

            await db.query("UPDATE support_tickets SET message_id = ? WHERE id = ?", [ticketMessage.id, ticketId]);

            await db.query("INSERT INTO support_messages SET ?", [{
                ticket_id: ticketId,
                user_id: interaction.user.id,
                username: interaction.user.tag,
                content: message,
                timestamp: createdAt,
                is_staff: false,
                staff_rank: null
            }]);

            const responseText = isDM ? texts.created : `${texts.created}\n${texts.guild_warning}`;
            await utils.safeInteractionRespond(interaction, responseText);
        } catch (error: any) {
            console.error("Support ticket creation error:", error);
            await utils.safeInteractionRespond(interaction, texts.error);
        }
    },
    ephemeral: true
};
