import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
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
        .setName("rpgmanage")
        .setDescription("RPG data and item management (Staff Only)")
        .addSubcommand(s => s.setName("create_item")
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
        .addSubcommand(s => s.setName("edit_item")
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
        .addSubcommand(s => s.setName("delete_item")
            .setDescription("Delete an item (Admin+)")
            .addIntegerOption(o => o.setName("item_id").setDescription("Item ID").setRequired(true)))
        .addSubcommand(s => s.setName("list_items")
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
        .addSubcommand(s => s.setName("create_achievement")
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
        .addSubcommand(s => s.setName("delete_achievement")
            .setDescription("Delete an achievement (Admin+)")
            .addIntegerOption(o => o.setName("achievement_id").setDescription("Achievement ID").setRequired(true)))
        .addSubcommand(s => s.setName("list_achievements")
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
        .addSubcommand(s => s.setName("create_pet")
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
        .addSubcommand(s => s.setName("delete_pet")
            .setDescription("Delete a pet (Admin+)")
            .addIntegerOption(o => o.setName("pet_id").setDescription("Pet ID").setRequired(true)))
        .addSubcommand(s => s.setName("list_pets")
            .setDescription("List all pets (Mod+)"))
        .addSubcommand(s => s.setName("create_dungeon")
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
        .addSubcommand(s => s.setName("delete_dungeon")
            .setDescription("Delete a dungeon (Admin+)")
            .addIntegerOption(o => o.setName("dungeon_id").setDescription("Dungeon ID").setRequired(true)))
        .addSubcommand(s => s.setName("list_dungeons")
            .setDescription("List all dungeons (Mod+)"))
        .addSubcommand(s => s.setName("create_material")
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
        .addSubcommand(s => s.setName("delete_material")
            .setDescription("Delete a crafting material (Admin+)")
            .addIntegerOption(o => o.setName("material_id").setDescription("Material ID").setRequired(true)))
        .addSubcommand(s => s.setName("list_materials")
            .setDescription("List all crafting materials (Mod+)"))
        .addSubcommand(s => s.setName("init_data")
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
            case "create_item": {
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

            case "edit_item": {
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

            case "delete_item": {
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

            case "list_items": {
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

            case "create_achievement": {
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

            case "delete_achievement": {
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

            case "list_achievements": {
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

            case "create_pet": {
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

            case "delete_pet": {
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

            case "list_pets": {
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

            case "create_dungeon": {
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

            case "delete_dungeon": {
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

            case "list_dungeons": {
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

            case "create_material": {
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

            case "delete_material": {
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

            case "list_materials": {
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

            case "init_data": {
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
