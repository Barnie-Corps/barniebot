import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, DMChannel, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import data from "../data";
import client from "..";

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Create a support ticket")
        .addStringOption(o => o.setName("message").setDescription("Describe your issue or question").setRequired(true)),
    category: "Support",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        // In guilds, require ManageMessages permission to prevent spam
        if (interaction.guild && interaction.member) {
            const member = interaction.member as any;
            if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return await interaction.editReply("You need the `Manage Messages` permission to use this command in a server. Try using it in DMs instead.");
            }
        }
        let texts = {
            creating: "Creating your support ticket...",
            created: "Your support ticket has been created! Our staff will respond soon.",
            error: "Failed to create support ticket. Please try again later.",
            dm_only_note: "Note: This command works best in DMs for privacy.",
            guild_warning: "Support ticket created. Please note that staff responses will be visible in this channel.",
            no_home_guild: "Support system is not properly configured.",
            ticket_info: "Ticket Information",
            user: "User",
            ticket_id: "Ticket ID",
            created_at: "Created At",
            initial_message: "Initial Message",
            origin: "Origin",
            dm_origin: "Direct Message",
            guild_origin: "Guild",
            status: "Status",
            open: "Open"
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const message = interaction.options.getString("message", true);
        const isDM = !interaction.guild;
        
        try {
            const homeGuild = await client.guilds.fetch(data.bot.home_guild);
            if (!homeGuild) {
                return await interaction.editReply(texts.no_home_guild);
            }

            const category = homeGuild.channels.cache.get(data.bot.support_category);
            if (!category || category.type !== ChannelType.GuildCategory) {
                return await interaction.editReply(texts.no_home_guild);
            }

            // Find available staff for auto-assignment
            let assignedStaff: string | null = null;
            try {
                // Get all staff members with status
                const allStaff = await utils.getStaffRanks();
                const staffIds = Object.keys(allStaff);
                
                // Get staff statuses
                const statuses: any = await db.query(
                    "SELECT user_id, status FROM staff_status WHERE user_id IN (?) AND status = 'available'",
                    [staffIds.length > 0 ? staffIds : ['none']]
                );
                
                const availableStaffIds = statuses.map((s: any) => s.user_id);
                
                // If we have available staff, find the one with least assigned tickets
                if (availableStaffIds.length > 0) {
                    const workloads: any = await db.query(
                        "SELECT assigned_to, COUNT(*) as count FROM support_tickets WHERE assigned_to IN (?) AND status = 'open' GROUP BY assigned_to",
                        [availableStaffIds]
                    );
                    
                    const workloadMap = new Map<string, number>();
                    workloads.forEach((w: any) => workloadMap.set(w.assigned_to, w.count));
                    
                    // Find staff with minimum workload (or not in workload map = 0 tickets)
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
                // Continue without assignment
            }
            
            // Create ticket in database
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
                    assigned_to: assignedStaff,
                    priority: "medium",
                    category: "general"
                }]
            );

            const ticketId = result.insertId;

            // Create channel in home guild
            const channelName = `support-request-${ticketId}`;
            const ticketChannel = await homeGuild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: data.bot.support_category,
                topic: `Support ticket #${ticketId} - User: ${interaction.user.tag} (${interaction.user.id})`,
            });

            // Update ticket with channel ID
            await db.query("UPDATE support_tickets SET channel_id = ? WHERE id = ?", [ticketChannel.id, ticketId]);

            // Create ticket embed
            const ticketEmbed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle(`${texts.ticket_info} #${ticketId}`)
                .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
                .addFields(
                    { name: texts.user, value: `${interaction.user.tag} (<@${interaction.user.id}>)\nID: ${interaction.user.id}`, inline: false },
                    { name: texts.ticket_id, value: `#${ticketId}`, inline: true },
                    { name: texts.status, value: texts.open, inline: true },
                    { name: "Priority", value: "🟡 Medium", inline: true },
                    { name: "Category", value: "General", inline: true },
                    { name: "Assigned To", value: assignedStaff ? `<@${assignedStaff}>` : "Unassigned", inline: true },
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
                        .setLabel("Close Ticket")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🔒")
                );

            const ticketMessage = await ticketChannel.send({ 
                content: assignedStaff ? `<@${assignedStaff}> - New ticket assigned to you!` : `<@&${data.bot.home_guild}> - New unassigned ticket!`, 
                embeds: [ticketEmbed], 
                components: [closeButton] 
            });
            
            // Send close option to user
            const userCloseEmbed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle("🎫 Support Ticket Created")
                .setDescription(`Your support ticket #${ticketId} has been created!\n\nOur staff will respond to you soon. You can close this ticket at any time using the button below.`)
                .addFields(
                    { name: "Ticket ID", value: `#${ticketId}`, inline: true },
                    { name: "Status", value: "Open", inline: true }
                )
                .setFooter({ text: "All messages you send here will be forwarded to staff" })
                .setTimestamp();
            
            const userCloseButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`close_ticket-${ticketId}-${interaction.user.id}`)
                        .setLabel("Close Ticket")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🔒")
                );
            
            try {
                await interaction.user.send({ embeds: [userCloseEmbed], components: [userCloseButton] });
            } catch (error) {
                console.error("Failed to send close option to user:", error);
            }
            
            // Store the original message ID for later updates
            await db.query("UPDATE support_tickets SET message_id = ? WHERE id = ?", [ticketMessage.id, ticketId]);

            // Save initial message to transcript
            await db.query("INSERT INTO support_messages SET ?", [{
                ticket_id: ticketId,
                user_id: interaction.user.id,
                username: interaction.user.tag,
                content: message,
                timestamp: createdAt,
                is_staff: false,
                staff_rank: null
            }]);

            const responseText = isDM 
                ? texts.created 
                : `${texts.created}\n${texts.guild_warning}`;

            await interaction.editReply(responseText);

        } catch (error: any) {
            console.error("Support ticket creation error:", error);
            await interaction.editReply(texts.error);
        }
    },
    ephemeral: true
};
