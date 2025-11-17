import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import data from "../data";
import client from "..";

// Helper to check if user is staff
function ensureStaff(executorRank: string | null): { ok: boolean; error?: string } {
    const idx = utils.getStaffRankIndex(executorRank);
    if (idx < 0) return { ok: false, error: "You must be staff to use this command." };
    return { ok: true };
}

// Helper to check if user is moderator+
function ensureModPlus(executorRank: string | null): { ok: boolean; error?: string } {
    const idx = utils.getStaffRankIndex(executorRank);
    const min = utils.getStaffRankIndex("Moderator");
    if (idx < 0 || idx < min) return { ok: false, error: "Moderator rank or higher required." };
    return { ok: true };
}

function ensureAdminPlus(executorRank: string | null): { ok: boolean; error?: string } {
    const idx = utils.getStaffRankIndex(executorRank);
    const min = utils.getStaffRankIndex("Probationary Administrator");
    if (idx < 0 || idx < min) return { ok: false, error: "Probationary Administrator rank or higher required." };
    return { ok: true };
}

// Helper to log staff actions
async function logStaffAction(staffId: string, actionType: string, targetId: string | null, details: string, metadata?: any) {
    try {
        await db.query("INSERT INTO staff_audit_log SET ?", [{
            staff_id: staffId,
            action_type: actionType,
            target_id: targetId,
            details: details,
            metadata: metadata ? JSON.stringify(metadata) : null,
            created_at: Date.now()
        }]);
    } catch (error) {
        console.error("Failed to log staff action:", error);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName("stafftools")
        .setDescription("Staff management and ticket tools")
        .addSubcommand(s => s.setName("tickets")
            .setDescription("List and manage tickets")
            .addStringOption(o => o.setName("filter")
                .setDescription("Filter tickets")
                .addChoices(
                    { name: "All Open", value: "all" },
                    { name: "Unassigned", value: "unassigned" },
                    { name: "My Tickets", value: "mine" },
                    { name: "High Priority", value: "priority" }
                )
                .setRequired(false)))
        .addSubcommand(s => s.setName("assign")
            .setDescription("Assign a ticket to a staff member")
            .addIntegerOption(o => o.setName("ticket_id").setDescription("Ticket ID").setRequired(true))
            .addUserOption(o => o.setName("staff").setDescription("Staff member to assign").setRequired(false)))
        .addSubcommand(s => s.setName("priority")
            .setDescription("Set ticket priority")
            .addIntegerOption(o => o.setName("ticket_id").setDescription("Ticket ID").setRequired(true))
            .addStringOption(o => o.setName("level")
                .setDescription("Priority level")
                .addChoices(
                    { name: "Low", value: "low" },
                    { name: "Medium", value: "medium" },
                    { name: "High", value: "high" },
                    { name: "Urgent", value: "urgent" }
                )
                .setRequired(true)))
        .addSubcommand(s => s.setName("category")
            .setDescription("Set ticket category")
            .addIntegerOption(o => o.setName("ticket_id").setDescription("Ticket ID").setRequired(true))
            .addStringOption(o => o.setName("type")
                .setDescription("Category type")
                .addChoices(
                    { name: "General", value: "general" },
                    { name: "Technical", value: "technical" },
                    { name: "Billing", value: "billing" },
                    { name: "Report", value: "report" },
                    { name: "Appeal", value: "appeal" }
                )
                .setRequired(true)))
        .addSubcommand(s => s.setName("status")
            .setDescription("Set your staff status")
            .addStringOption(o => o.setName("state")
                .setDescription("Your status")
                .addChoices(
                    { name: "Available", value: "available" },
                    { name: "Busy", value: "busy" },
                    { name: "Away", value: "away" },
                    { name: "Offline", value: "offline" }
                )
                .setRequired(true))
            .addStringOption(o => o.setName("message").setDescription("Status message (optional)").setRequired(false)))
        .addSubcommand(s => s.setName("note")
            .setDescription("Add a staff note about a user")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("note").setDescription("Note content").setRequired(true)))
        .addSubcommand(s => s.setName("notes")
            .setDescription("View staff notes about a user")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
        .addSubcommand(s => s.setName("search")
            .setDescription("Search tickets by user or content")
            .addStringOption(o => o.setName("query").setDescription("Search query").setRequired(true)))
        .addSubcommand(s => s.setName("auditlog")
            .setDescription("View staff action audit log")
            .addUserOption(o => o.setName("staff").setDescription("Filter by staff member").setRequired(false))
            .addStringOption(o => o.setName("action")
                .setDescription("Filter by action type")
                .addChoices(
                    { name: "All Actions", value: "all" },
                    { name: "Warnings", value: "WARN" },
                    { name: "Mutes", value: "MUTE" },
                    { name: "Blacklists", value: "BLACKLIST" },
                    { name: "Tickets", value: "TICKET" },
                    { name: "Assignments", value: "ASSIGN" }
                )
                .setRequired(false))
            .addIntegerOption(o => o.setName("days").setDescription("Filter by days ago (default: 7)").setRequired(false)))
        .addSubcommand(s => s.setName("reviewappeals")
            .setDescription("Review pending warning appeals")
            .addIntegerOption(o => o.setName("warning_id").setDescription("Specific warning ID to review").setRequired(false))
            .addStringOption(o => o.setName("decision")
                .setDescription("Decision for the appeal")
                .addChoices(
                    { name: "Approve (Remove warning)", value: "approve" },
                    { name: "Deny (Keep warning)", value: "deny" }
                )
                .setRequired(false)))
        .addSubcommand(s => s.setName("notify")
            .setDescription("Send a global notification to all users (Admin+)")
            .addStringOption(o => o.setName("content").setDescription("Notification message").setRequired(true))
            .addStringOption(o => o.setName("language").setDescription("Source language (default: en)").setRequired(false))),
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        const sub = interaction.options.getSubcommand();
        const executor = interaction.user;
        const executorRank = await utils.getUserStaffRank(executor.id);

        const perm = ensureStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

        switch (sub) {
            case "tickets": {
                const filter = interaction.options.getString("filter") || "all";
                
                let query = "SELECT * FROM support_tickets WHERE status = 'open'";
                const params: any[] = [];
                
                switch (filter) {
                    case "unassigned":
                        query += " AND (assigned_to IS NULL OR assigned_to = '')";
                        break;
                    case "mine":
                        query += " AND assigned_to = ?";
                        params.push(executor.id);
                        break;
                    case "priority":
                        query += " AND priority IN ('high', 'urgent')";
                        break;
                }
                
                query += " ORDER BY created_at DESC LIMIT 10";
                
                const tickets: any = await db.query(query, params);
                
                if (!tickets || tickets.length === 0) {
                    return interaction.editReply("No tickets found matching your filter.");
                }
                
                const embed = new EmbedBuilder()
                    .setColor("Purple")
                    .setTitle("🎫 Open Support Tickets")
                    .setDescription(`Filter: **${filter.charAt(0).toUpperCase() + filter.slice(1)}**\nShowing ${tickets.length} ticket(s)`)
                    .setTimestamp();
                
                for (const ticket of tickets.slice(0, 10)) {
                    const user = await client.users.fetch(ticket.user_id).catch(() => null);
                    const assignedUser = ticket.assigned_to ? await client.users.fetch(ticket.assigned_to).catch(() => null) : null;
                    
                    const priorityEmoji: Record<string, string> = {
                        low: "🟢",
                        medium: "🟡",
                        high: "🟠",
                        urgent: "🔴"
                    };
                    const emoji = priorityEmoji[ticket.priority] || "⚪";
                    
                    const age = Math.floor((Date.now() - ticket.created_at) / 60000); // minutes
                    const ageText = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;
                    
                    embed.addFields({
                        name: `${emoji} #${ticket.id} - ${ticket.category}`,
                        value: `User: ${user ? user.tag : "Unknown"} | Age: ${ageText}\nAssigned: ${assignedUser ? assignedUser.tag : "None"}\n${ticket.initial_message.substring(0, 100)}...`,
                        inline: false
                    });
                }
                
                await logStaffAction(executor.id, "VIEW_TICKETS", null, `Viewed tickets with filter: ${filter}`);
                return interaction.editReply({ embeds: [embed] });
            }
            
            case "assign": {
                const ticketId = interaction.options.getInteger("ticket_id", true);
                const staffUser = interaction.options.getUser("staff") || executor;
                
                // Check if staff user is actually staff
                const staffRank = await utils.getUserStaffRank(staffUser.id);
                if (!staffRank) {
                    return interaction.editReply("The specified user is not a staff member.");
                }
                
                const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ? AND status = 'open'", [ticketId]);
                if (!ticket[0]) {
                    return interaction.editReply(`Ticket #${ticketId} not found or already closed.`);
                }
                
                await db.query("UPDATE support_tickets SET assigned_to = ? WHERE id = ?", [staffUser.id, ticketId]);
                
                // Notify in ticket channel
                try {
                    const ticketChannel = await client.channels.fetch(ticket[0].channel_id);
                    if (ticketChannel && ticketChannel.isTextBased()) {
                        await (ticketChannel as any).send(`📌 This ticket has been assigned to ${staffUser.tag} by ${executor.tag}.`);
                    }
                } catch (error) {
                    console.error("Failed to notify in ticket channel:", error);
                }
                
                await logStaffAction(executor.id, "ASSIGN_TICKET", ticket[0].user_id, `Assigned ticket #${ticketId} to ${staffUser.tag}`, { ticket_id: ticketId, assigned_to: staffUser.id });
                return interaction.editReply(`✅ Ticket #${ticketId} has been assigned to ${staffUser.tag}.`);
            }
            
            case "priority": {
                const ticketId = interaction.options.getInteger("ticket_id", true);
                const priority = interaction.options.getString("level", true);
                
                const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
                if (!ticket[0]) {
                    return interaction.editReply(`Ticket #${ticketId} not found.`);
                }
                
                await db.query("UPDATE support_tickets SET priority = ? WHERE id = ?", [priority, ticketId]);
                
                const priorityEmoji: Record<string, string> = {
                    low: "🟢",
                    medium: "🟡",
                    high: "🟠",
                    urgent: "🔴"
                };
                const emoji = priorityEmoji[priority] || "⚪";
                
                // Notify in ticket channel
                try {
                    const ticketChannel = await client.channels.fetch(ticket[0].channel_id);
                    if (ticketChannel && ticketChannel.isTextBased()) {
                        await (ticketChannel as any).send(`${emoji} Priority set to **${priority.toUpperCase()}** by ${executor.tag}.`);
                    }
                } catch (error) {
                    console.error("Failed to notify in ticket channel:", error);
                }
                
                await logStaffAction(executor.id, "SET_PRIORITY", ticket[0].user_id, `Set ticket #${ticketId} priority to ${priority}`, { ticket_id: ticketId, priority });
                return interaction.editReply(`${emoji} Ticket #${ticketId} priority set to **${priority.toUpperCase()}**.`);
            }
            
            case "category": {
                const ticketId = interaction.options.getInteger("ticket_id", true);
                const category = interaction.options.getString("type", true);
                
                const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
                if (!ticket[0]) {
                    return interaction.editReply(`Ticket #${ticketId} not found.`);
                }
                
                await db.query("UPDATE support_tickets SET category = ? WHERE id = ?", [category, ticketId]);
                
                await logStaffAction(executor.id, "SET_CATEGORY", ticket[0].user_id, `Set ticket #${ticketId} category to ${category}`, { ticket_id: ticketId, category });
                return interaction.editReply(`📁 Ticket #${ticketId} category set to **${category}**.`);
            }
            
            case "status": {
                const status = interaction.options.getString("state", true);
                const message = interaction.options.getString("message") || null;
                
                await db.query(
                    "INSERT INTO staff_status SET ? ON DUPLICATE KEY UPDATE status = VALUES(status), status_message = VALUES(status_message), updated_at = VALUES(updated_at)",
                    [{ user_id: executor.id, status, status_message: message, updated_at: Date.now() }]
                );
                
                const statusEmoji: Record<string, string> = {
                    available: "🟢",
                    busy: "🟡",
                    away: "🟠",
                    offline: "⚫"
                };
                const emoji = statusEmoji[status] || "⚪";
                
                await logStaffAction(executor.id, "SET_STATUS", null, `Changed status to ${status}${message ? `: ${message}` : ""}`, { status, message });
                return interaction.editReply(`${emoji} Your status has been set to **${status.toUpperCase()}**${message ? `\nMessage: ${message}` : ""}`);
            }
            
            case "note": {
                const user = interaction.options.getUser("user", true);
                const noteContent = interaction.options.getString("note", true);
                
                await db.query("INSERT INTO staff_notes SET ?", [{
                    user_id: user.id,
                    staff_id: executor.id,
                    note: noteContent,
                    created_at: Date.now()
                }]);
                
                await logStaffAction(executor.id, "ADD_NOTE", user.id, `Added note about ${user.tag}`, { note: noteContent });
                return interaction.editReply(`📝 Note added for ${user.tag}.`);
            }
            
            case "notes": {
                const user = interaction.options.getUser("user", true);
                
                const notes: any = await db.query("SELECT * FROM staff_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [user.id]);
                
                if (!notes || notes.length === 0) {
                    return interaction.editReply(`No notes found for ${user.tag}.`);
                }
                
                const embed = new EmbedBuilder()
                    .setColor("Purple")
                    .setTitle(`📝 Staff Notes - ${user.tag}`)
                    .setThumbnail(user.displayAvatarURL())
                    .setDescription(`Showing ${notes.length} note(s)`)
                    .setTimestamp();
                
                for (const note of notes) {
                    const staffUser = await client.users.fetch(note.staff_id).catch(() => null);
                    const timestamp = new Date(note.created_at);
                    
                    embed.addFields({
                        name: `${staffUser ? staffUser.tag : "Unknown"} - ${timestamp.toLocaleDateString()}`,
                        value: note.note.substring(0, 1024),
                        inline: false
                    });
                }
                
                await logStaffAction(executor.id, "VIEW_NOTES", user.id, `Viewed notes for ${user.tag}`);
                return interaction.editReply({ embeds: [embed] });
            }
            
            case "search": {
                const query = interaction.options.getString("query", true);
                
                // Search in tickets
                const tickets: any = await db.query(
                    "SELECT * FROM support_tickets WHERE (initial_message LIKE ? OR user_id = ?) AND status = 'open' ORDER BY created_at DESC LIMIT 10",
                    [`%${query}%`, query]
                );
                
                if (!tickets || tickets.length === 0) {
                    return interaction.editReply(`No tickets found matching query: "${query}"`);
                }
                
                const embed = new EmbedBuilder()
                    .setColor("Purple")
                    .setTitle("🔍 Ticket Search Results")
                    .setDescription(`Query: "${query}"\nFound ${tickets.length} ticket(s)`)
                    .setTimestamp();
                
                for (const ticket of tickets.slice(0, 5)) {
                    const user = await client.users.fetch(ticket.user_id).catch(() => null);
                    const assignedUser = ticket.assigned_to ? await client.users.fetch(ticket.assigned_to).catch(() => null) : null;
                    
                    embed.addFields({
                        name: `#${ticket.id} - ${ticket.category} [${ticket.priority}]`,
                        value: `User: ${user ? user.tag : "Unknown"}\nAssigned: ${assignedUser ? assignedUser.tag : "None"}\n${ticket.initial_message.substring(0, 150)}...`,
                        inline: false
                    });
                }
                
                await logStaffAction(executor.id, "SEARCH_TICKETS", null, `Searched tickets: "${query}"`, { query });
                return interaction.editReply({ embeds: [embed] });
            }
            
            case "auditlog": {
                // Moderator+ required for viewing audit logs
                const modPerm = ensureModPlus(executorRank);
                if (!modPerm.ok) return interaction.editReply(modPerm.error || "Moderator rank or higher required.");
                
                const staffUser = interaction.options.getUser("staff");
                const actionFilter = interaction.options.getString("action") || "all";
                const days = interaction.options.getInteger("days") || 7;
                const since = Date.now() - (days * 24 * 60 * 60 * 1000);
                
                let query = "SELECT * FROM staff_audit_log WHERE created_at >= ?";
                const params: any[] = [since];
                
                if (staffUser) {
                    query += " AND staff_id = ?";
                    params.push(staffUser.id);
                }
                
                if (actionFilter !== "all") {
                    query += " AND action_type LIKE ?";
                    params.push(`${actionFilter}%`);
                }
                
                query += " ORDER BY created_at DESC LIMIT 20";
                
                const logs: any = await db.query(query, params);
                
                if (!logs || logs.length === 0) {
                    return interaction.editReply("No audit log entries found matching your criteria.");
                }
                
                const embed = new EmbedBuilder()
                    .setColor("Purple")
                    .setTitle("📋 Staff Audit Log")
                    .setDescription(`${staffUser ? `Staff: ${staffUser.tag}\n` : ""}Action: **${actionFilter}**\nPeriod: Last ${days} day(s)\nShowing ${logs.length} entry(ies)`)
                    .setTimestamp();
                
                for (const log of logs.slice(0, 10)) {
                    const staff = await client.users.fetch(log.staff_id).catch(() => null);
                    const target = log.target_id ? await client.users.fetch(log.target_id).catch(() => null) : null;
                    const timestamp = new Date(log.created_at);
                    
                    const actionEmoji: Record<string, string> = {
                        WARN: "⚠️",
                        MUTE: "🔇",
                        UNMUTE: "🔊",
                        BLACKLIST: "🚫",
                        UNBLACKLIST: "✅",
                        ASSIGN_TICKET: "📌",
                        CLOSE_TICKET: "🔒",
                        SET_PRIORITY: "🎯",
                        SET_CATEGORY: "📁",
                        SET_STATUS: "🔵",
                        ADD_NOTE: "📝",
                        VIEW_TICKETS: "👁️",
                        VIEW_NOTES: "👁️",
                        SEARCH_TICKETS: "🔍"
                    };
                    
                    const emoji = actionEmoji[log.action_type] || "📌";
                    
                    embed.addFields({
                        name: `${emoji} ${log.action_type} - ${timestamp.toLocaleString()}`,
                        value: `Staff: ${staff ? staff.tag : "Unknown"}\n${target ? `Target: ${target.tag}\n` : ""}Details: ${log.details}`,
                        inline: false
                    });
                }
                
                if (logs.length > 10) {
                    embed.setFooter({ text: `Showing 10 of ${logs.length} entries` });
                }
                
                await logStaffAction(executor.id, "VIEW_AUDIT_LOG", null, `Viewed audit log${staffUser ? ` for ${staffUser.tag}` : ""}`, { filter: actionFilter, days });
                return interaction.editReply({ embeds: [embed] });
            }
            
            case "reviewappeals": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
                
                const warningId = interaction.options.getInteger("warning_id");
                const decision = interaction.options.getString("decision");
                
                // If specific warning ID and decision provided, process it
                if (warningId && decision) {
                    const warningData: any = await db.query("SELECT * FROM global_warnings WHERE id = ? AND appealed = TRUE AND appeal_status = 'pending'", [warningId]);
                    
                    if (!warningData[0]) {
                        return interaction.editReply(`Warning #${warningId} not found or not pending appeal.`);
                    }
                    
                    const warning = warningData[0];
                    const user = await client.users.fetch(warning.userid).catch(() => null);
                    
                    if (decision === "approve") {
                        // Approve appeal - mark warning as inactive and approved
                        await db.query("UPDATE global_warnings SET appeal_status = 'approved', active = FALSE, appeal_reviewed_by = ?, appeal_reviewed_at = ? WHERE id = ?", 
                            [executor.id, Date.now(), warningId]);
                        
                        // Notify user
                        if (user) {
                            try {
                                const { EmbedBuilder } = await import("discord.js");
                                const approveEmbed = new EmbedBuilder()
                                    .setColor("Green")
                                    .setTitle("✅ Appeal Approved")
                                    .setDescription(`Your appeal for warning #${warningId} has been **approved** by ${executor.username}.`)
                                    .addFields(
                                        { name: "Original Warning", value: warning.reason },
                                        { name: "Status", value: "Warning removed and points deducted" }
                                    )
                                    .setTimestamp();
                                
                                await user.send({ embeds: [approveEmbed] });
                            } catch {}
                        }
                        
                        // Announce to staff
                        const { manager } = await import("..");
                        await manager.announce(`✅ **Appeal Approved**: Warning #${warningId} for ${user?.username || "Unknown"} has been removed by ${executor.username}.`, "en");
                        
                        await logStaffAction(executor.id, "APPROVE_APPEAL", warning.userid, `Approved appeal for warning #${warningId}`, { warningId, warning: warning.reason });
                        
                        return interaction.editReply(`✅ Appeal for warning #${warningId} has been **approved**. Warning removed.`);
                    } else if (decision === "deny") {
                        // Deny appeal - keep warning active
                        await db.query("UPDATE global_warnings SET appeal_status = 'denied', appeal_reviewed_by = ?, appeal_reviewed_at = ? WHERE id = ?", 
                            [executor.id, Date.now(), warningId]);
                        
                        // Notify user
                        if (user) {
                            try {
                                const { EmbedBuilder } = await import("discord.js");
                                const denyEmbed = new EmbedBuilder()
                                    .setColor("Red")
                                    .setTitle("❌ Appeal Denied")
                                    .setDescription(`Your appeal for warning #${warningId} has been **denied** by ${executor.username}.`)
                                    .addFields(
                                        { name: "Original Warning", value: warning.reason },
                                        { name: "Status", value: "Warning remains active. You cannot resubmit this appeal." }
                                    )
                                    .setTimestamp();
                                
                                await user.send({ embeds: [denyEmbed] });
                            } catch {}
                        }
                        
                        // Announce to staff
                        const { manager } = await import("..");
                        await manager.announce(`❌ **Appeal Denied**: Warning #${warningId} for ${user?.username || "Unknown"} remains active (reviewed by ${executor.username}).`, "en");
                        
                        await logStaffAction(executor.id, "DENY_APPEAL", warning.userid, `Denied appeal for warning #${warningId}`, { warningId, warning: warning.reason });
                        
                        return interaction.editReply(`❌ Appeal for warning #${warningId} has been **denied**. Warning remains active.`);
                    }
                }
                
                // If no specific decision, show pending appeals list
                const pendingAppeals: any = await db.query("SELECT * FROM global_warnings WHERE appealed = TRUE AND appeal_status = 'pending' ORDER BY createdAt DESC LIMIT 10");
                
                if (pendingAppeals.length === 0) {
                    return interaction.editReply("📋 No pending appeals to review.");
                }
                
                const { EmbedBuilder } = await import("discord.js");
                const embed = new EmbedBuilder()
                    .setColor("Blue")
                    .setTitle("📋 Pending Warning Appeals")
                    .setDescription(`${pendingAppeals.length} appeal(s) pending review\n\nUse \`/stafftools reviewappeals <warning_id> <decision>\` to process an appeal.`)
                    .setTimestamp();
                
                for (const appeal of pendingAppeals) {
                    const user = await client.users.fetch(appeal.userid).catch(() => null);
                    const author = await client.users.fetch(appeal.authorid).catch(() => null);
                    
                    const categoryEmojis: Record<string, string> = {
                        spam: "📧",
                        harassment: "😡",
                        nsfw: "🔞",
                        hate_speech: "🚫",
                        impersonation: "🎭",
                        advertising: "📢",
                        doxxing: "🔍",
                        raiding: "⚔️",
                        disrespect: "😤",
                        general: "⚠️"
                    };
                    
                    const emoji = categoryEmojis[appeal.category] || "⚠️";
                    const pointsText = appeal.points === 1 ? "1 pt" : `${appeal.points} pts`;
                    
                    let fieldValue = `**User:** ${user?.username || "Unknown"} (${appeal.userid})\n`;
                    fieldValue += `**Original:** ${emoji} ${appeal.category} - ${pointsText}\n`;
                    fieldValue += `**Reason:** ${appeal.reason}\n`;
                    fieldValue += `**Issued by:** ${author?.username || "Unknown"}\n`;
                    fieldValue += `**Issued:** <t:${Math.floor(appeal.createdAt / 1000)}:R>\n\n`;
                    fieldValue += `**Appeal:**\n${appeal.appeal_reason}\n\n`;
                    fieldValue += `To review: \`/stafftools reviewappeals ${appeal.id} <approve|deny>\``;
                    
                    embed.addFields({
                        name: `Appeal #${appeal.id}`,
                        value: fieldValue,
                        inline: false
                    });
                }
                
                await logStaffAction(executor.id, "VIEW_APPEALS", null, "Viewed pending appeals");
                return interaction.editReply({ embeds: [embed] });
            }

            case "notify": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const content = interaction.options.getString("content", true);
                const language = interaction.options.getString("language") || "en";

                if (content.length > 2000) {
                    return interaction.editReply("Notification content must be 2000 characters or less.");
                }

                await db.query("INSERT INTO global_notifications SET ?", [{
                    content,
                    language,
                    created_by: executor.id,
                    created_at: Date.now()
                }]);

                await logStaffAction(executor.id, "CREATE_NOTIFICATION", null, `Created global notification: "${content.substring(0, 50)}..."`, { language });
                return interaction.editReply(`📢 Global notification created successfully!\n\nUsers will be notified when they next use a command.`);
            }
        }
    },
    ephemeral: true
};
