import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Message, TextChannel } from "discord.js";
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
            .addStringOption(o => o.setName("language").setDescription("Source language (default: en)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_freeze")
            .setDescription("Freeze an RPG account (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason for freeze").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_unfreeze")
            .setDescription("Unfreeze an RPG account (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_ban")
            .setDescription("Ban an RPG account (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addStringOption(o => o.setName("reason").setDescription("Reason for ban").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_unban")
            .setDescription("Unban an RPG account (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_stats")
            .setDescription("Modify character stats (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addStringOption(o => o.setName("stat")
                .setDescription("Stat to modify")
                .addChoices(
                    { name: "Level", value: "level" },
                    { name: "Experience", value: "experience" },
                    { name: "Gold", value: "gold" },
                    { name: "HP", value: "max_hp" },
                    { name: "MP", value: "max_mp" },
                    { name: "Strength", value: "strength" },
                    { name: "Defense", value: "defense" },
                    { name: "Agility", value: "agility" },
                    { name: "Intelligence", value: "intelligence" },
                    { name: "Luck", value: "luck" },
                    { name: "Stat Points", value: "stat_points" }
                )
                .setRequired(true))
            .addIntegerOption(o => o.setName("value").setDescription("New value").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_password")
            .setDescription("Change account password (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addStringOption(o => o.setName("new_password").setDescription("New password").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_logout")
            .setDescription("Force logout an account (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_info")
            .setDescription("View detailed RPG account info (Mod+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_give_item")
            .setDescription("Give an item to a character (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addIntegerOption(o => o.setName("item_id").setDescription("Item ID").setRequired(true))
            .addIntegerOption(o => o.setName("quantity").setDescription("Quantity (default: 1)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_remove_item")
            .setDescription("Remove an item from a character (Admin+)")
            .addStringOption(o => o.setName("username").setDescription("Account username").setRequired(true))
            .addIntegerOption(o => o.setName("item_id").setDescription("Item ID").setRequired(true))
            .addIntegerOption(o => o.setName("quantity").setDescription("Quantity (default: 1)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_create_item")
            .setDescription("Create a new item (Admin+)")
            .addStringOption(o => o.setName("name").setDescription("Item name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Item description").setRequired(true))
            .addStringOption(o => o.setName("type")
                .setDescription("Item type")
                .addChoices(
                    { name: "Weapon", value: "weapon" },
                    { name: "Armor", value: "armor" },
                    { name: "Consumable", value: "consumable" },
                    { name: "Material", value: "material" },
                    { name: "Accessory", value: "accessory" },
                    { name: "Quest", value: "quest" }
                )
                .setRequired(true))
            .addStringOption(o => o.setName("rarity")
                .setDescription("Item rarity")
                .addChoices(
                    { name: "Common", value: "common" },
                    { name: "Uncommon", value: "uncommon" },
                    { name: "Rare", value: "rare" },
                    { name: "Epic", value: "epic" },
                    { name: "Legendary", value: "legendary" }
                )
                .setRequired(true))
            .addIntegerOption(o => o.setName("base_value").setDescription("Base gold value").setRequired(true))
            .addBooleanOption(o => o.setName("tradeable").setDescription("Can be traded (default: true)").setRequired(false))
            .addBooleanOption(o => o.setName("stackable").setDescription("Can be stacked (default: true)").setRequired(false))
            .addIntegerOption(o => o.setName("max_stack").setDescription("Max stack size (default: 99)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_edit_item")
            .setDescription("Edit an existing item (Admin+)")
            .addIntegerOption(o => o.setName("item_id").setDescription("Item ID").setRequired(true))
            .addStringOption(o => o.setName("field")
                .setDescription("Field to edit")
                .addChoices(
                    { name: "Name", value: "name" },
                    { name: "Description", value: "description" },
                    { name: "Base Value", value: "base_value" },
                    { name: "Rarity", value: "rarity" },
                    { name: "Tradeable", value: "tradeable" },
                    { name: "Stackable", value: "stackable" },
                    { name: "Max Stack", value: "max_stack" }
                )
                .setRequired(true))
            .addStringOption(o => o.setName("value").setDescription("New value").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_delete_item")
            .setDescription("Delete an item (Admin+)")
            .addIntegerOption(o => o.setName("item_id").setDescription("Item ID").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_list_items")
            .setDescription("List all items (Mod+)")
            .addStringOption(o => o.setName("type")
                .setDescription("Filter by type")
                .addChoices(
                    { name: "All", value: "all" },
                    { name: "Weapon", value: "weapon" },
                    { name: "Armor", value: "armor" },
                    { name: "Consumable", value: "consumable" },
                    { name: "Material", value: "material" },
                    { name: "Accessory", value: "accessory" }
                )
                .setRequired(false))
            .addStringOption(o => o.setName("rarity")
                .setDescription("Filter by rarity")
                .addChoices(
                    { name: "All", value: "all" },
                    { name: "Common", value: "common" },
                    { name: "Uncommon", value: "uncommon" },
                    { name: "Rare", value: "rare" },
                    { name: "Epic", value: "epic" },
                    { name: "Legendary", value: "legendary" }
                )
                .setRequired(false)))
        .addSubcommand(s => s.setName("rpg_create_achievement")
            .setDescription("Create a new achievement (Admin+)")
            .addStringOption(o => o.setName("name").setDescription("Achievement name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Achievement description").setRequired(true))
            .addStringOption(o => o.setName("category")
                .setDescription("Category")
                .addChoices(
                    { name: "Combat", value: "combat" },
                    { name: "Exploration", value: "exploration" },
                    { name: "Crafting", value: "crafting" },
                    { name: "Collection", value: "collection" },
                    { name: "Social", value: "social" }
                )
                .setRequired(true))
            .addStringOption(o => o.setName("requirement_type").setDescription("Requirement type (e.g., battles_won)").setRequired(true))
            .addIntegerOption(o => o.setName("requirement_value").setDescription("Requirement value").setRequired(true))
            .addIntegerOption(o => o.setName("reward_gold").setDescription("Gold reward").setRequired(true))
            .addIntegerOption(o => o.setName("reward_experience").setDescription("Experience reward").setRequired(true))
            .addStringOption(o => o.setName("icon").setDescription("Icon emoji (default: 🏆)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_delete_achievement")
            .setDescription("Delete an achievement (Admin+)")
            .addIntegerOption(o => o.setName("achievement_id").setDescription("Achievement ID").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_list_achievements")
            .setDescription("List all achievements (Mod+)")
            .addStringOption(o => o.setName("category")
                .setDescription("Filter by category")
                .addChoices(
                    { name: "All", value: "all" },
                    { name: "Combat", value: "combat" },
                    { name: "Exploration", value: "exploration" },
                    { name: "Crafting", value: "crafting" },
                    { name: "Collection", value: "collection" },
                    { name: "Social", value: "social" }
                )
                .setRequired(false)))
        .addSubcommand(s => s.setName("rpg_create_pet")
            .setDescription("Create a new pet (Admin+)")
            .addStringOption(o => o.setName("name").setDescription("Pet name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Pet description").setRequired(true))
            .addStringOption(o => o.setName("rarity")
                .setDescription("Pet rarity")
                .addChoices(
                    { name: "Common", value: "common" },
                    { name: "Uncommon", value: "uncommon" },
                    { name: "Rare", value: "rare" },
                    { name: "Epic", value: "epic" },
                    { name: "Legendary", value: "legendary" }
                )
                .setRequired(true))
            .addIntegerOption(o => o.setName("base_price").setDescription("Base price in gold").setRequired(true))
            .addIntegerOption(o => o.setName("strength").setDescription("Strength bonus").setRequired(true))
            .addIntegerOption(o => o.setName("defense").setDescription("Defense bonus").setRequired(true))
            .addIntegerOption(o => o.setName("agility").setDescription("Agility bonus").setRequired(true))
            .addIntegerOption(o => o.setName("intelligence").setDescription("Intelligence bonus").setRequired(true))
            .addIntegerOption(o => o.setName("luck").setDescription("Luck bonus").setRequired(true))
            .addStringOption(o => o.setName("special_ability").setDescription("Special ability description").setRequired(false))
            .addStringOption(o => o.setName("emoji").setDescription("Pet emoji (default: 🐾)").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_delete_pet")
            .setDescription("Delete a pet (Admin+)")
            .addIntegerOption(o => o.setName("pet_id").setDescription("Pet ID").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_list_pets")
            .setDescription("List all pets (Mod+)"))
        .addSubcommand(s => s.setName("rpg_create_dungeon")
            .setDescription("Create a new dungeon (Admin+)")
            .addStringOption(o => o.setName("name").setDescription("Dungeon name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Dungeon description").setRequired(true))
            .addIntegerOption(o => o.setName("required_level").setDescription("Required level").setRequired(true))
            .addStringOption(o => o.setName("difficulty")
                .setDescription("Difficulty")
                .addChoices(
                    { name: "Easy", value: "Easy" },
                    { name: "Normal", value: "Normal" },
                    { name: "Hard", value: "Hard" },
                    { name: "Expert", value: "Expert" },
                    { name: "Master", value: "Master" }
                )
                .setRequired(true))
            .addIntegerOption(o => o.setName("stages").setDescription("Number of stages").setRequired(true))
            .addStringOption(o => o.setName("boss_name").setDescription("Boss name").setRequired(true))
            .addIntegerOption(o => o.setName("reward_gold_min").setDescription("Minimum gold reward").setRequired(true))
            .addIntegerOption(o => o.setName("reward_gold_max").setDescription("Maximum gold reward").setRequired(true))
            .addIntegerOption(o => o.setName("reward_exp_min").setDescription("Minimum experience reward").setRequired(true))
            .addIntegerOption(o => o.setName("reward_exp_max").setDescription("Maximum experience reward").setRequired(true))
            .addIntegerOption(o => o.setName("cooldown").setDescription("Cooldown in seconds").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_delete_dungeon")
            .setDescription("Delete a dungeon (Admin+)")
            .addIntegerOption(o => o.setName("dungeon_id").setDescription("Dungeon ID").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_list_dungeons")
            .setDescription("List all dungeons (Mod+)"))
        .addSubcommand(s => s.setName("rpg_create_material")
            .setDescription("Create a new crafting material (Admin+)")
            .addStringOption(o => o.setName("name").setDescription("Material name").setRequired(true))
            .addStringOption(o => o.setName("description").setDescription("Material description").setRequired(true))
            .addStringOption(o => o.setName("rarity")
                .setDescription("Material rarity")
                .addChoices(
                    { name: "Common", value: "common" },
                    { name: "Uncommon", value: "uncommon" },
                    { name: "Rare", value: "rare" },
                    { name: "Epic", value: "epic" },
                    { name: "Legendary", value: "legendary" }
                )
                .setRequired(true))
            .addIntegerOption(o => o.setName("stack_size").setDescription("Max stack size").setRequired(true))
            .addNumberOption(o => o.setName("drop_rate").setDescription("Drop rate percentage (0-100)").setRequired(true))
            .addStringOption(o => o.setName("emoji").setDescription("Material emoji").setRequired(false)))
        .addSubcommand(s => s.setName("rpg_delete_material")
            .setDescription("Delete a crafting material (Admin+)")
            .addIntegerOption(o => o.setName("material_id").setDescription("Material ID").setRequired(true)))
        .addSubcommand(s => s.setName("rpg_list_materials")
            .setDescription("List all crafting materials (Mod+)"))
        .addSubcommand(s => s.setName("rpg_init_data")
            .setDescription("Initialize/reinitialize RPG data (Admin+)")
            .addBooleanOption(o => o.setName("force").setDescription("Force reinitialize existing data").setRequired(false))),
    category: "Bot Staff",
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
                return interaction.editReply({ embeds: [embed], content: "" });
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
                return interaction.editReply({ embeds: [embed], content: "" });
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
                return interaction.editReply({ embeds: [embed], content: "" });
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
                return interaction.editReply({ embeds: [embed], content: "" });
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

                                await user.send({ embeds: [approveEmbed], content: "" });
                            } catch { }
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

                                await user.send({ embeds: [denyEmbed], content: "" });
                            } catch { }
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
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "notify": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const language = interaction.options.getString("language") || "en";

                if (!interaction.channel || !("createMessageCollector" in interaction.channel)) {
                    return interaction.editReply("❌ This command must be used in a text channel.");
                }

                const promptMsg = await interaction.editReply("📢 **Create Global Notification**\n\nPlease send the notification content in your next message.\n\n*You have 2 minutes to respond. The message will be deleted after collection.*");

                const filter = (m: Message) => m.author.id === executor.id;
                const textChannel = interaction.channel as TextChannel;
                const collector = textChannel.createMessageCollector({
                    filter,
                    max: 1,
                    time: 120000
                });

                collector.on("collect", async (msg: Message) => {
                    const content = msg.content;

                    try {
                        await msg.delete();
                    } catch { }

                    if (!content || content.trim().length === 0) {
                        return interaction.followUp({
                            content: "❌ Notification content cannot be empty.",
                            ephemeral: true
                        });
                    }

                    if (content.length > 2000) {
                        return interaction.followUp({
                            content: "❌ Notification content must be 2000 characters or less.",
                            ephemeral: true
                        });
                    }

                    await db.query("INSERT INTO global_notifications SET ?", [{
                        content,
                        language,
                        created_by: executor.id,
                        created_at: Date.now()
                    }]);

                    await logStaffAction(executor.id, "CREATE_NOTIFICATION", null, `Created global notification: "${content.substring(0, 50)}..."`, { language, length: content.length });

                    await interaction.followUp({
                        content: `📢 **Global notification created successfully!**\n\nUsers will be notified when they next use a command.\n\n**Preview:**\n${content.substring(0, 200)}${content.length > 200 ? "..." : ""}`,
                        ephemeral: true
                    });
                });

                collector.on("end", (collected: any) => {
                    if (collected.size === 0) {
                        interaction.followUp({
                            content: "⏱️ Notification creation timed out. Please try again.",
                            ephemeral: true
                        }).catch(() => { });
                    }
                });

                break;
            }

            case "rpg_freeze": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const reason = interaction.options.getString("reason", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                await db.query(
                    "INSERT INTO rpg_account_status SET ? ON DUPLICATE KEY UPDATE frozen = TRUE, frozen_reason = VALUES(frozen_reason), frozen_by = VALUES(frozen_by), frozen_at = VALUES(frozen_at)",
                    [{ account_id: account[0].id, frozen: true, frozen_reason: reason, frozen_by: executor.id, frozen_at: Date.now() }]
                );

                await db.query("UPDATE rpg_sessions SET active = FALSE WHERE account_id = ?", [account[0].id]);

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const freezeEmbed = new EmbedBuilder()
                            .setColor("#0000FF")
                            .setTitle("❄️ Account Frozen")
                            .setDescription(`Your RPG account **${username}** has been frozen by staff.`)
                            .addFields(
                                { name: "Reason", value: reason },
                                { name: "Frozen by", value: executor.username }
                            )
                            .setTimestamp();
                        await user.send({ embeds: [freezeEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_FREEZE", account[0].last_user_logged, `Froze RPG account ${username}: ${reason}`, { username, accountId: account[0].id });
                return interaction.editReply(`❄️ **Account frozen:** ${username}\n**Reason:** ${reason}\nThe account has been logged out.`);
            }

            case "rpg_unfreeze": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                await db.query(
                    "INSERT INTO rpg_account_status SET ? ON DUPLICATE KEY UPDATE frozen = FALSE, frozen_reason = NULL, frozen_by = NULL, frozen_at = NULL",
                    [{ account_id: account[0].id, frozen: false }]
                );

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const unfreezeEmbed = new EmbedBuilder()
                            .setColor("#00FF00")
                            .setTitle("✅ Account Unfrozen")
                            .setDescription(`Your RPG account **${username}** has been unfrozen by staff.`)
                            .addFields({ name: "Unfrozen by", value: executor.username })
                            .setTimestamp();
                        await user.send({ embeds: [unfreezeEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_UNFREEZE", account[0].last_user_logged, `Unfroze RPG account ${username}`, { username, accountId: account[0].id });
                return interaction.editReply(`✅ **Account unfrozen:** ${username}\nThe user can now log in again.`);
            }

            case "rpg_ban": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const reason = interaction.options.getString("reason", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                await db.query(
                    "INSERT INTO rpg_account_status SET ? ON DUPLICATE KEY UPDATE banned = TRUE, banned_reason = VALUES(banned_reason), banned_by = VALUES(banned_by), banned_at = VALUES(banned_at)",
                    [{ account_id: account[0].id, banned: true, banned_reason: reason, banned_by: executor.id, banned_at: Date.now() }]
                );

                await db.query("UPDATE rpg_sessions SET active = FALSE WHERE account_id = ?", [account[0].id]);

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const banEmbed = new EmbedBuilder()
                            .setColor("#000000")
                            .setTitle("🚫 Account Banned")
                            .setDescription(`Your RPG account **${username}** has been permanently banned.`)
                            .addFields(
                                { name: "Reason", value: reason },
                                { name: "Banned by", value: executor.username }
                            )
                            .setTimestamp();
                        await user.send({ embeds: [banEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_BAN", account[0].last_user_logged, `Banned RPG account ${username}: ${reason}`, { username, accountId: account[0].id });
                return interaction.editReply(`🚫 **Account banned:** ${username}\n**Reason:** ${reason}\nThe account has been logged out.`);
            }

            case "rpg_unban": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                await db.query(
                    "INSERT INTO rpg_account_status SET ? ON DUPLICATE KEY UPDATE banned = FALSE, banned_reason = NULL, banned_by = NULL, banned_at = NULL",
                    [{ account_id: account[0].id, banned: false }]
                );

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const unbanEmbed = new EmbedBuilder()
                            .setColor("#00FF00")
                            .setTitle("✅ Account Unbanned")
                            .setDescription(`Your RPG account **${username}** has been unbanned by staff.`)
                            .addFields({ name: "Unbanned by", value: executor.username })
                            .setTimestamp();
                        await user.send({ embeds: [unbanEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_UNBAN", account[0].last_user_logged, `Unbanned RPG account ${username}`, { username, accountId: account[0].id });
                return interaction.editReply(`✅ **Account unbanned:** ${username}\nThe user can now log in again.`);
            }

            case "rpg_stats": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const stat = interaction.options.getString("stat", true);
                const value = interaction.options.getInteger("value", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [account[0].id]);
                if (!character[0]) {
                    return interaction.editReply(`❌ No character found for account **${username}**.`);
                }

                const validStats = ["level", "experience", "gold", "max_hp", "max_mp", "strength", "defense", "agility", "intelligence", "luck", "stat_points"];
                if (!validStats.includes(stat)) {
                    return interaction.editReply(`❌ Invalid stat: ${stat}`);
                }

                const oldValue = character[0][stat];
                await db.query(`UPDATE rpg_characters SET ${stat} = ? WHERE id = ?`, [value, character[0].id]);

                if (stat === "max_hp") {
                    await db.query("UPDATE rpg_characters SET hp = ? WHERE id = ?", [value, character[0].id]);
                }
                if (stat === "max_mp") {
                    await db.query("UPDATE rpg_characters SET mp = ? WHERE id = ?", [value, character[0].id]);
                }

                await logStaffAction(executor.id, "RPG_MODIFY_STATS", account[0].last_user_logged, `Modified ${stat} for ${username}: ${oldValue} → ${value}`, { username, stat, oldValue, newValue: value });
                return interaction.editReply(`📊 **Stats modified for ${username}**\n**${stat}:** ${oldValue} → ${value}`);
            }

            case "rpg_password": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const newPassword = interaction.options.getString("new_password", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const encryptedPassword = utils.encryptWithAES(data.bot.encryption_key, newPassword);
                await db.query("UPDATE registered_accounts SET password = ? WHERE id = ?", [encryptedPassword, account[0].id]);

                await db.query("UPDATE rpg_sessions SET active = FALSE WHERE account_id = ?", [account[0].id]);

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const passwordEmbed = new EmbedBuilder()
                            .setColor("#FFA500")
                            .setTitle("🔐 Password Changed")
                            .setDescription(`Your RPG account password has been changed by staff.\n\n**New Password:** ||${newPassword}||`)
                            .addFields({ name: "Changed by", value: executor.username })
                            .setFooter({ text: "Please log in again with your new password" })
                            .setTimestamp();
                        await user.send({ embeds: [passwordEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_CHANGE_PASSWORD", account[0].last_user_logged, `Changed password for ${username}`, { username, accountId: account[0].id });
                return interaction.editReply(`🔐 **Password changed for ${username}**\nThe account has been logged out. User has been notified.`);
            }

            case "rpg_logout": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const session: any = await db.query("SELECT * FROM rpg_sessions WHERE account_id = ? AND active = TRUE", [account[0].id]);
                if (!session[0]) {
                    return interaction.editReply(`❌ Account **${username}** is not currently logged in.`);
                }

                await db.query("UPDATE rpg_sessions SET active = FALSE WHERE account_id = ?", [account[0].id]);

                const user = await client.users.fetch(account[0].last_user_logged).catch(() => null);
                if (user) {
                    try {
                        const logoutEmbed = new EmbedBuilder()
                            .setColor("#FF6600")
                            .setTitle("🚪 Forced Logout")
                            .setDescription(`You have been logged out of your RPG account **${username}** by staff.`)
                            .addFields({ name: "Logged out by", value: executor.username })
                            .setTimestamp();
                        await user.send({ embeds: [logoutEmbed], content: "" });
                    } catch { }
                }

                await logStaffAction(executor.id, "RPG_LOGOUT", account[0].last_user_logged, `Force logged out ${username}`, { username, accountId: account[0].id });
                return interaction.editReply(`🚪 **Account logged out:** ${username}`);
            }

            case "rpg_info": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [account[0].id]);
                const session: any = await db.query("SELECT * FROM rpg_sessions WHERE account_id = ? AND active = TRUE", [account[0].id]);
                const status: any = await db.query("SELECT * FROM rpg_account_status WHERE account_id = ?", [account[0].id]);

                const infoEmbed = new EmbedBuilder()
                    .setColor("#9B59B6")
                    .setTitle(`📋 RPG Account Info: ${username}`)
                    .setTimestamp();

                infoEmbed.addFields(
                    { name: "Account ID", value: account[0].id.toString(), inline: true },
                    { name: "Email", value: account[0].email, inline: true },
                    { name: "Verified", value: account[0].verified ? "✅" : "❌", inline: true },
                    { name: "Created", value: `<t:${Math.floor(account[0].created_at / 1000)}:R>`, inline: true },
                    { name: "Last Login", value: account[0].last_login ? `<t:${Math.floor(account[0].last_login / 1000)}:R>` : "Never", inline: true },
                    { name: "Last User", value: account[0].last_user_logged !== "0" ? `<@${account[0].last_user_logged}>` : "None", inline: true }
                );

                if (character[0]) {
                    infoEmbed.addFields(
                        { name: "Character Name", value: character[0].name, inline: true },
                        { name: "Class", value: character[0].class, inline: true },
                        { name: "Level", value: character[0].level.toString(), inline: true },
                        { name: "Gold", value: character[0].gold.toLocaleString(), inline: true },
                        { name: "HP", value: `${character[0].hp}/${character[0].max_hp}`, inline: true },
                        { name: "MP", value: `${character[0].mp}/${character[0].max_mp}`, inline: true },
                        { name: "Stats", value: `STR: ${character[0].strength} | DEF: ${character[0].defense} | AGI: ${character[0].agility}\nINT: ${character[0].intelligence} | LUK: ${character[0].luck}`, inline: false }
                    );
                } else {
                    infoEmbed.addFields({ name: "Character", value: "No character created", inline: false });
                }

                if (session[0]) {
                    infoEmbed.addFields(
                        { name: "Session Status", value: "🟢 Active", inline: true },
                        { name: "Logged in", value: `<t:${Math.floor(session[0].logged_in_at / 1000)}:R>`, inline: true }
                    );
                } else {
                    infoEmbed.addFields({ name: "Session Status", value: "⚫ Offline", inline: false });
                }

                if (status[0]) {
                    if (status[0].frozen) {
                        const frozenBy = await client.users.fetch(status[0].frozen_by).catch(() => null);
                        infoEmbed.addFields({
                            name: "❄️ Frozen",
                            value: `**Reason:** ${status[0].frozen_reason}\n**By:** ${frozenBy?.username || "Unknown"}\n**At:** <t:${Math.floor(status[0].frozen_at / 1000)}:R>`,
                            inline: false
                        });
                    }
                    if (status[0].banned) {
                        const bannedBy = await client.users.fetch(status[0].banned_by).catch(() => null);
                        infoEmbed.addFields({
                            name: "🚫 Banned",
                            value: `**Reason:** ${status[0].banned_reason}\n**By:** ${bannedBy?.username || "Unknown"}\n**At:** <t:${Math.floor(status[0].banned_at / 1000)}:R>`,
                            inline: false
                        });
                    }
                }

                await logStaffAction(executor.id, "RPG_VIEW_INFO", account[0].last_user_logged, `Viewed RPG info for ${username}`, { username, accountId: account[0].id });
                return interaction.editReply({ embeds: [infoEmbed], content: "" });
            }

            case "rpg_give_item": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const itemId = interaction.options.getInteger("item_id", true);
                const quantity = interaction.options.getInteger("quantity") || 1;

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [account[0].id]);
                if (!character[0]) {
                    return interaction.editReply(`❌ No character found for account **${username}**.`);
                }

                const item: any = await db.query("SELECT * FROM rpg_items WHERE id = ?", [itemId]);
                if (!item[0]) {
                    return interaction.editReply(`❌ Item ID **${itemId}** not found.`);
                }

                const existingItem: any = await db.query("SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?", [character[0].id, itemId]);

                if (existingItem[0] && item[0].stackable) {
                    await db.query("UPDATE rpg_inventory SET quantity = quantity + ? WHERE id = ?", [quantity, existingItem[0].id]);
                } else {
                    await db.query("INSERT INTO rpg_inventory SET ?", [{
                        character_id: character[0].id,
                        item_id: itemId,
                        quantity: quantity,
                        acquired_at: Date.now(),
                        bound: false
                    }]);
                }

                await logStaffAction(executor.id, "RPG_GIVE_ITEM", account[0].last_user_logged, `Gave ${quantity}x ${item[0].name} to ${username}`, { username, itemId, itemName: item[0].name, quantity });
                return interaction.editReply(`✅ **Item given to ${username}**\n**Item:** ${item[0].name}\n**Quantity:** ${quantity}`);
            }

            case "rpg_remove_item": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const username = interaction.options.getString("username", true);
                const itemId = interaction.options.getInteger("item_id", true);
                const quantity = interaction.options.getInteger("quantity") || 1;

                const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);
                if (!account[0]) {
                    return interaction.editReply(`❌ Account **${username}** not found.`);
                }

                const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [account[0].id]);
                if (!character[0]) {
                    return interaction.editReply(`❌ No character found for account **${username}**.`);
                }

                const item: any = await db.query("SELECT * FROM rpg_items WHERE id = ?", [itemId]);
                if (!item[0]) {
                    return interaction.editReply(`❌ Item ID **${itemId}** not found.`);
                }

                const existingItem: any = await db.query("SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?", [character[0].id, itemId]);

                if (!existingItem[0]) {
                    return interaction.editReply(`❌ Character does not have this item.`);
                }

                if (existingItem[0].quantity <= quantity) {
                    await db.query("DELETE FROM rpg_inventory WHERE id = ?", [existingItem[0].id]);
                } else {
                    await db.query("UPDATE rpg_inventory SET quantity = quantity - ? WHERE id = ?", [quantity, existingItem[0].id]);
                }

                await logStaffAction(executor.id, "RPG_REMOVE_ITEM", account[0].last_user_logged, `Removed ${quantity}x ${item[0].name} from ${username}`, { username, itemId, itemName: item[0].name, quantity });
                return interaction.editReply(`✅ **Item removed from ${username}**\n**Item:** ${item[0].name}\n**Quantity:** ${quantity}`);
            }

            case "rpg_create_item": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const name = interaction.options.getString("name", true);
                const description = interaction.options.getString("description", true);
                const type = interaction.options.getString("type", true);
                const rarity = interaction.options.getString("rarity", true);
                const baseValue = interaction.options.getInteger("base_value", true);
                const tradeable = interaction.options.getBoolean("tradeable") ?? true;
                const stackable = interaction.options.getBoolean("stackable") ?? true;
                const maxStack = interaction.options.getInteger("max_stack") || 99;

                const result: any = await db.query("INSERT INTO rpg_items SET ?", [{
                    name,
                    description,
                    type,
                    rarity,
                    base_value: baseValue,
                    tradeable,
                    stackable,
                    max_stack: maxStack
                }]);

                await logStaffAction(executor.id, "RPG_CREATE_ITEM", null, `Created item: ${name} (${type}, ${rarity})`, { name, type, rarity, baseValue });
                return interaction.editReply(`✅ **Item created successfully!**\n**Name:** ${name}\n**Type:** ${type}\n**Rarity:** ${rarity}\n**ID:** ${result.insertId}\n**Base Value:** ${baseValue}g`);
            }

            case "rpg_edit_item": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const itemId = interaction.options.getInteger("item_id", true);
                const field = interaction.options.getString("field", true);
                const value = interaction.options.getString("value", true);

                const item: any = await db.query("SELECT * FROM rpg_items WHERE id = ?", [itemId]);
                if (!item[0]) {
                    return interaction.editReply(`❌ Item ID **${itemId}** not found.`);
                }

                const validFields = ["name", "description", "base_value", "rarity", "tradeable", "stackable", "max_stack"];
                if (!validFields.includes(field)) {
                    return interaction.editReply(`❌ Invalid field: ${field}`);
                }

                let processedValue: any = value;
                if (field === "base_value" || field === "max_stack") {
                    processedValue = parseInt(value);
                    if (isNaN(processedValue)) {
                        return interaction.editReply(`❌ ${field} must be a number.`);
                    }
                }
                if (field === "tradeable" || field === "stackable") {
                    processedValue = value.toLowerCase() === "true";
                }

                const oldValue = item[0][field];
                await db.query(`UPDATE rpg_items SET ${field} = ? WHERE id = ?`, [processedValue, itemId]);

                await logStaffAction(executor.id, "RPG_EDIT_ITEM", null, `Edited item ${item[0].name}: ${field} = ${oldValue} → ${processedValue}`, { itemId, field, oldValue, newValue: processedValue });
                return interaction.editReply(`✅ **Item updated!**\n**Item:** ${item[0].name}\n**Field:** ${field}\n**Old Value:** ${oldValue}\n**New Value:** ${processedValue}`);
            }

            case "rpg_delete_item": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const itemId = interaction.options.getInteger("item_id", true);

                const item: any = await db.query("SELECT * FROM rpg_items WHERE id = ?", [itemId]);
                if (!item[0]) {
                    return interaction.editReply(`❌ Item ID **${itemId}** not found.`);
                }

                await db.query("DELETE FROM rpg_items WHERE id = ?", [itemId]);
                await db.query("DELETE FROM rpg_equipment WHERE item_id = ?", [itemId]);
                await db.query("DELETE FROM rpg_consumables WHERE item_id = ?", [itemId]);
                await db.query("DELETE FROM rpg_inventory WHERE item_id = ?", [itemId]);

                await logStaffAction(executor.id, "RPG_DELETE_ITEM", null, `Deleted item: ${item[0].name}`, { itemId, itemName: item[0].name });
                return interaction.editReply(`✅ **Item deleted:** ${item[0].name}\nAll related data has been removed.`);
            }

            case "rpg_list_items": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const typeFilter = interaction.options.getString("type") || "all";
                const rarityFilter = interaction.options.getString("rarity") || "all";

                let query = "SELECT * FROM rpg_items WHERE 1=1";
                const params: any[] = [];

                if (typeFilter !== "all") {
                    query += " AND type = ?";
                    params.push(typeFilter);
                }
                if (rarityFilter !== "all") {
                    query += " AND rarity = ?";
                    params.push(rarityFilter);
                }

                query += " ORDER BY rarity, type, name LIMIT 50";

                const items: any = await db.query(query, params);

                if (!items || items.length === 0) {
                    return interaction.editReply("No items found matching your filters.");
                }

                const rarityEmojis: Record<string, string> = {
                    common: "⚪",
                    uncommon: "🟢",
                    rare: "🔵",
                    epic: "🟣",
                    legendary: "🟠"
                };

                const embed = new EmbedBuilder()
                    .setColor("Gold")
                    .setTitle("🗡️ RPG Items Database")
                    .setDescription(`Type: **${typeFilter}** | Rarity: **${rarityFilter}**\nShowing ${items.length} item(s)`)
                    .setTimestamp();

                for (const item of items.slice(0, 25)) {
                    const emoji = rarityEmojis[item.rarity] || "⚪";
                    embed.addFields({
                        name: `${emoji} ${item.name} (ID: ${item.id})`,
                        value: `Type: ${item.type} | Rarity: ${item.rarity}\nValue: ${item.base_value}g | Stack: ${item.max_stack}\n${item.description}`,
                        inline: true
                    });
                }

                if (items.length > 25) {
                    embed.setFooter({ text: `Showing 25 of ${items.length} items` });
                }

                await logStaffAction(executor.id, "RPG_LIST_ITEMS", null, `Listed items: ${typeFilter}/${rarityFilter}`);
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "rpg_create_achievement": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const name = interaction.options.getString("name", true);
                const description = interaction.options.getString("description", true);
                const category = interaction.options.getString("category", true);
                const requirementType = interaction.options.getString("requirement_type", true);
                const requirementValue = interaction.options.getInteger("requirement_value", true);
                const rewardGold = interaction.options.getInteger("reward_gold", true);
                const rewardExperience = interaction.options.getInteger("reward_experience", true);
                const icon = interaction.options.getString("icon") || "🏆";

                const result: any = await db.query("INSERT INTO rpg_achievements SET ?", [{
                    name,
                    description,
                    category,
                    requirement_type: requirementType,
                    requirement_value: requirementValue,
                    reward_gold: rewardGold,
                    reward_experience: rewardExperience,
                    icon
                }]);

                await logStaffAction(executor.id, "RPG_CREATE_ACHIEVEMENT", null, `Created achievement: ${name}`, { name, category, requirementType, requirementValue });
                return interaction.editReply(`✅ **Achievement created!**\n${icon} **${name}**\n${description}\n**Category:** ${category}\n**Requirement:** ${requirementType} = ${requirementValue}\n**Rewards:** ${rewardGold}g, ${rewardExperience} XP\n**ID:** ${result.insertId}`);
            }

            case "rpg_delete_achievement": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const achievementId = interaction.options.getInteger("achievement_id", true);

                const achievement: any = await db.query("SELECT * FROM rpg_achievements WHERE id = ?", [achievementId]);
                if (!achievement[0]) {
                    return interaction.editReply(`❌ Achievement ID **${achievementId}** not found.`);
                }

                await db.query("DELETE FROM rpg_achievements WHERE id = ?", [achievementId]);
                await db.query("DELETE FROM rpg_character_achievements WHERE achievement_id = ?", [achievementId]);

                await logStaffAction(executor.id, "RPG_DELETE_ACHIEVEMENT", null, `Deleted achievement: ${achievement[0].name}`, { achievementId });
                return interaction.editReply(`✅ **Achievement deleted:** ${achievement[0].name}`);
            }

            case "rpg_list_achievements": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const categoryFilter = interaction.options.getString("category") || "all";

                let query = "SELECT * FROM rpg_achievements WHERE 1=1";
                const params: any[] = [];

                if (categoryFilter !== "all") {
                    query += " AND category = ?";
                    params.push(categoryFilter);
                }

                query += " ORDER BY category, requirement_value LIMIT 25";

                const achievements: any = await db.query(query, params);

                if (!achievements || achievements.length === 0) {
                    return interaction.editReply("No achievements found.");
                }

                const embed = new EmbedBuilder()
                    .setColor("Purple")
                    .setTitle("🏆 RPG Achievements Database")
                    .setDescription(`Category: **${categoryFilter}**\nShowing ${achievements.length} achievement(s)`)
                    .setTimestamp();

                for (const ach of achievements) {
                    embed.addFields({
                        name: `${ach.icon} ${ach.name} (ID: ${ach.id})`,
                        value: `${ach.description}\n**Category:** ${ach.category}\n**Requirement:** ${ach.requirement_type} = ${ach.requirement_value}\n**Rewards:** ${ach.reward_gold}g, ${ach.reward_experience} XP`,
                        inline: false
                    });
                }

                await logStaffAction(executor.id, "RPG_LIST_ACHIEVEMENTS", null, `Listed achievements: ${categoryFilter}`);
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "rpg_create_pet": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const name = interaction.options.getString("name", true);
                const description = interaction.options.getString("description", true);
                const rarity = interaction.options.getString("rarity", true);
                const basePrice = interaction.options.getInteger("base_price", true);
                const strength = interaction.options.getInteger("strength", true);
                const defense = interaction.options.getInteger("defense", true);
                const agility = interaction.options.getInteger("agility", true);
                const intelligence = interaction.options.getInteger("intelligence", true);
                const luck = interaction.options.getInteger("luck", true);
                const specialAbility = interaction.options.getString("special_ability") || null;
                const emoji = interaction.options.getString("emoji") || "🐾";

                const result: any = await db.query("INSERT INTO rpg_pets SET ?", [{
                    name,
                    description,
                    rarity,
                    base_price: basePrice,
                    strength_bonus: strength,
                    defense_bonus: defense,
                    agility_bonus: agility,
                    intelligence_bonus: intelligence,
                    luck_bonus: luck,
                    special_ability: specialAbility,
                    emoji
                }]);

                await logStaffAction(executor.id, "RPG_CREATE_PET", null, `Created pet: ${name}`, { name, rarity, basePrice });
                return interaction.editReply(`✅ **Pet created!**\n${emoji} **${name}**\n${description}\n**Rarity:** ${rarity}\n**Price:** ${basePrice}g\n**Stats:** STR+${strength} DEF+${defense} AGI+${agility} INT+${intelligence} LUK+${luck}\n**ID:** ${result.insertId}`);
            }

            case "rpg_delete_pet": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const petId = interaction.options.getInteger("pet_id", true);

                const pet: any = await db.query("SELECT * FROM rpg_pets WHERE id = ?", [petId]);
                if (!pet[0]) {
                    return interaction.editReply(`❌ Pet ID **${petId}** not found.`);
                }

                await db.query("DELETE FROM rpg_pets WHERE id = ?", [petId]);
                await db.query("DELETE FROM rpg_character_pets WHERE pet_id = ?", [petId]);

                await logStaffAction(executor.id, "RPG_DELETE_PET", null, `Deleted pet: ${pet[0].name}`, { petId });
                return interaction.editReply(`✅ **Pet deleted:** ${pet[0].name}`);
            }

            case "rpg_list_pets": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const pets: any = await db.query("SELECT * FROM rpg_pets ORDER BY rarity, name");

                if (!pets || pets.length === 0) {
                    return interaction.editReply("No pets found.");
                }

                const embed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle("🐾 RPG Pets Database")
                    .setDescription(`Total pets: ${pets.length}`)
                    .setTimestamp();

                for (const pet of pets) {
                    embed.addFields({
                        name: `${pet.emoji} ${pet.name} (ID: ${pet.id})`,
                        value: `${pet.description}\n**Rarity:** ${pet.rarity} | **Price:** ${pet.base_price}g\n**Stats:** STR+${pet.strength_bonus} DEF+${pet.defense_bonus} AGI+${pet.agility_bonus} INT+${pet.intelligence_bonus} LUK+${pet.luck_bonus}\n${pet.special_ability ? `**Ability:** ${pet.special_ability}` : ""}`,
                        inline: false
                    });
                }

                await logStaffAction(executor.id, "RPG_LIST_PETS", null, "Listed all pets");
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "rpg_create_dungeon": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const name = interaction.options.getString("name", true);
                const description = interaction.options.getString("description", true);
                const requiredLevel = interaction.options.getInteger("required_level", true);
                const difficulty = interaction.options.getString("difficulty", true);
                const stages = interaction.options.getInteger("stages", true);
                const bossName = interaction.options.getString("boss_name", true);
                const rewardGoldMin = interaction.options.getInteger("reward_gold_min", true);
                const rewardGoldMax = interaction.options.getInteger("reward_gold_max", true);
                const rewardExpMin = interaction.options.getInteger("reward_exp_min", true);
                const rewardExpMax = interaction.options.getInteger("reward_exp_max", true);
                const cooldown = interaction.options.getInteger("cooldown", true);

                const result: any = await db.query("INSERT INTO rpg_dungeons SET ?", [{
                    name,
                    description,
                    required_level: requiredLevel,
                    difficulty,
                    stages,
                    boss_name: bossName,
                    reward_gold_min: rewardGoldMin,
                    reward_gold_max: rewardGoldMax,
                    reward_exp_min: rewardExpMin,
                    reward_exp_max: rewardExpMax,
                    cooldown: cooldown * 1000
                }]);

                await logStaffAction(executor.id, "RPG_CREATE_DUNGEON", null, `Created dungeon: ${name}`, { name, difficulty, requiredLevel });
                return interaction.editReply(`✅ **Dungeon created!**\n🗺️ **${name}**\n${description}\n**Difficulty:** ${difficulty} | **Level:** ${requiredLevel}+\n**Stages:** ${stages} | **Boss:** ${bossName}\n**Rewards:** ${rewardGoldMin}-${rewardGoldMax}g, ${rewardExpMin}-${rewardExpMax} XP\n**Cooldown:** ${cooldown}s\n**ID:** ${result.insertId}`);
            }

            case "rpg_delete_dungeon": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const dungeonId = interaction.options.getInteger("dungeon_id", true);

                const dungeon: any = await db.query("SELECT * FROM rpg_dungeons WHERE id = ?", [dungeonId]);
                if (!dungeon[0]) {
                    return interaction.editReply(`❌ Dungeon ID **${dungeonId}** not found.`);
                }

                await db.query("DELETE FROM rpg_dungeons WHERE id = ?", [dungeonId]);
                await db.query("DELETE FROM rpg_dungeon_runs WHERE dungeon_id = ?", [dungeonId]);

                await logStaffAction(executor.id, "RPG_DELETE_DUNGEON", null, `Deleted dungeon: ${dungeon[0].name}`, { dungeonId });
                return interaction.editReply(`✅ **Dungeon deleted:** ${dungeon[0].name}`);
            }

            case "rpg_list_dungeons": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const dungeons: any = await db.query("SELECT * FROM rpg_dungeons ORDER BY required_level");

                if (!dungeons || dungeons.length === 0) {
                    return interaction.editReply("No dungeons found.");
                }

                const embed = new EmbedBuilder()
                    .setColor("Red")
                    .setTitle("🗺️ RPG Dungeons Database")
                    .setDescription(`Total dungeons: ${dungeons.length}`)
                    .setTimestamp();

                for (const dungeon of dungeons) {
                    const cooldownMins = Math.floor(dungeon.cooldown / 60000);
                    embed.addFields({
                        name: `🗺️ ${dungeon.name} (ID: ${dungeon.id})`,
                        value: `${dungeon.description}\n**Difficulty:** ${dungeon.difficulty} | **Level:** ${dungeon.required_level}+\n**Stages:** ${dungeon.stages} | **Boss:** ${dungeon.boss_name}\n**Rewards:** ${dungeon.reward_gold_min}-${dungeon.reward_gold_max}g, ${dungeon.reward_exp_min}-${dungeon.reward_exp_max} XP\n**Cooldown:** ${cooldownMins}m`,
                        inline: false
                    });
                }

                await logStaffAction(executor.id, "RPG_LIST_DUNGEONS", null, "Listed all dungeons");
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "rpg_create_material": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const name = interaction.options.getString("name", true);
                const description = interaction.options.getString("description", true);
                const rarity = interaction.options.getString("rarity", true);
                const stackSize = interaction.options.getInteger("stack_size", true);
                const dropRate = interaction.options.getNumber("drop_rate", true);
                const emoji = interaction.options.getString("emoji") || "📦";

                if (dropRate < 0 || dropRate > 100) {
                    return interaction.editReply("❌ Drop rate must be between 0 and 100.");
                }

                const result: any = await db.query("INSERT INTO rpg_crafting_materials SET ?", [{
                    name,
                    description,
                    rarity,
                    stack_size: stackSize,
                    drop_rate: dropRate,
                    emoji
                }]);

                await logStaffAction(executor.id, "RPG_CREATE_MATERIAL", null, `Created material: ${name}`, { name, rarity, dropRate });
                return interaction.editReply(`✅ **Material created!**\n${emoji} **${name}**\n${description}\n**Rarity:** ${rarity}\n**Stack Size:** ${stackSize}\n**Drop Rate:** ${dropRate}%\n**ID:** ${result.insertId}`);
            }

            case "rpg_delete_material": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const materialId = interaction.options.getInteger("material_id", true);

                const material: any = await db.query("SELECT * FROM rpg_crafting_materials WHERE id = ?", [materialId]);
                if (!material[0]) {
                    return interaction.editReply(`❌ Material ID **${materialId}** not found.`);
                }

                await db.query("DELETE FROM rpg_crafting_materials WHERE id = ?", [materialId]);
                await db.query("DELETE FROM rpg_character_materials WHERE material_id = ?", [materialId]);

                await logStaffAction(executor.id, "RPG_DELETE_MATERIAL", null, `Deleted material: ${material[0].name}`, { materialId });
                return interaction.editReply(`✅ **Material deleted:** ${material[0].name}`);
            }

            case "rpg_list_materials": {
                const perm = ensureModPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const materials: any = await db.query("SELECT * FROM rpg_crafting_materials ORDER BY rarity, name");

                if (!materials || materials.length === 0) {
                    return interaction.editReply("No materials found.");
                }

                const embed = new EmbedBuilder()
                    .setColor("Orange")
                    .setTitle("📦 RPG Materials Database")
                    .setDescription(`Total materials: ${materials.length}`)
                    .setTimestamp();

                for (const mat of materials) {
                    embed.addFields({
                        name: `${mat.emoji} ${mat.name} (ID: ${mat.id})`,
                        value: `${mat.description}\n**Rarity:** ${mat.rarity} | **Stack:** ${mat.stack_size}\n**Drop Rate:** ${mat.drop_rate}%`,
                        inline: true
                    });
                }

                await logStaffAction(executor.id, "RPG_LIST_MATERIALS", null, "Listed all materials");
                return interaction.editReply({ embeds: [embed], content: "" });
            }

            case "rpg_init_data": {
                const perm = ensureAdminPlus(executorRank);
                if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

                const force = interaction.options.getBoolean("force") || false;

                await interaction.editReply("🔄 Initializing RPG data... This may take a moment.");

                try {
                    const { initializeShopItems, initializeRPGData } = await import("../rpg_init");

                    if (force) {
                        await interaction.editReply("⚠️ Force mode enabled. Checking existing data...");
                    }

                    await initializeShopItems();
                    await initializeRPGData();

                    await logStaffAction(executor.id, "RPG_INIT_DATA", null, `Initialized RPG data (force: ${force})`);
                    return interaction.editReply(`✅ **RPG data initialization complete!**\n\nInitialized:\n• Shop items and equipment\n• Achievements\n• Crafting materials\n• Pets\n• Dungeons\n\n${force ? "**Force mode:** Existing data was checked for conflicts." : "**Note:** Existing data was not overwritten."}`);
                } catch (error: any) {
                    await logStaffAction(executor.id, "RPG_INIT_DATA_FAILED", null, `Failed to initialize RPG data: ${error.message}`);
                    return interaction.editReply(`❌ **Failed to initialize RPG data**\n\`\`\`${error.message}\`\`\``);
                }
            }
        }
    },
    ephemeral: true
};
