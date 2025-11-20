import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

const CLASSES = {
    warrior: {
        name: "Warrior",
        emoji: "⚔️",
        description: "Masters of melee combat with high HP and defense",
        stats: { hp: 150, mp: 30, str: 15, def: 15, agi: 8, int: 5, luk: 7 }
    },
    mage: {
        name: "Mage",
        emoji: "🔮",
        description: "Wielders of arcane magic with high MP and intelligence",
        stats: { hp: 80, mp: 100, str: 5, def: 6, agi: 7, int: 18, luk: 9 }
    },
    rogue: {
        name: "Rogue",
        emoji: "🗡️",
        description: "Swift assassins with high agility and critical strikes",
        stats: { hp: 100, mp: 50, str: 12, def: 8, agi: 18, int: 7, luk: 15 }
    },
    paladin: {
        name: "Paladin",
        emoji: "🛡️",
        description: "Holy knights with balanced stats and healing abilities",
        stats: { hp: 130, mp: 70, str: 12, def: 14, agi: 8, int: 11, luk: 10 }
    },
    archer: {
        name: "Archer",
        emoji: "🏹",
        description: "Long-range specialists with high agility and precision",
        stats: { hp: 90, mp: 60, str: 10, def: 7, agi: 16, int: 9, luk: 13 }
    }
};

async function getSession(userId: string) {
    const session: any = await db.query(
        "SELECT s.*, a.username FROM rpg_sessions s JOIN registered_accounts a ON s.account_id = a.id WHERE s.uid = ? AND s.active = TRUE",
        [userId]
    );
    return session[0] || null;
}

async function getCharacter(accountId: number) {
    const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [accountId]);
    return character[0] || null;
}

export default {
    data: new SlashCommandBuilder()
        .setName("rpg")
        .setDescription("RPG system commands")
        .addSubcommand(s => s.setName("create")
            .setDescription("Create your RPG character")
            .addStringOption(o => o.setName("name")
                .setDescription("Your character name")
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(20))
            .addStringOption(o => o.setName("class")
                .setDescription("Your character class")
                .setRequired(true)
                .addChoices(
                    { name: "⚔️ Warrior - Melee tank", value: "warrior" },
                    { name: "🔮 Mage - Magic damage", value: "mage" },
                    { name: "🗡️ Rogue - Critical strikes", value: "rogue" },
                    { name: "🛡️ Paladin - Holy support", value: "paladin" },
                    { name: "🏹 Archer - Ranged DPS", value: "archer" }
                )))
        .addSubcommand(s => s.setName("profile")
            .setDescription("View your character profile"))
        .addSubcommand(s => s.setName("stats")
            .setDescription("Manage your character stats")
            .addStringOption(o => o.setName("action")
                .setDescription("Action to perform")
                .setRequired(true)
                .addChoices(
                    { name: "View Stats", value: "view" },
                    { name: "Allocate Points", value: "allocate" }
                ))
            .addStringOption(o => o.setName("stat")
                .setDescription("Stat to increase (for allocate)")
                .addChoices(
                    { name: "Strength", value: "strength" },
                    { name: "Defense", value: "defense" },
                    { name: "Agility", value: "agility" },
                    { name: "Intelligence", value: "intelligence" },
                    { name: "Luck", value: "luck" }
                ))
            .addIntegerOption(o => o.setName("points")
                .setDescription("Number of points to allocate")
                .setMinValue(1)))
        .addSubcommand(s => s.setName("inventory")
            .setDescription("View your inventory")
            .addIntegerOption(o => o.setName("page")
                .setDescription("Page number")
                .setMinValue(1)))
        .addSubcommand(s => s.setName("equip")
            .setDescription("Equip an item from your inventory")
            .addIntegerOption(o => o.setName("item_id")
                .setDescription("Inventory item ID")
                .setRequired(true)))
        .addSubcommand(s => s.setName("unequip")
            .setDescription("Unequip an item")
            .addStringOption(o => o.setName("slot")
                .setDescription("Equipment slot")
                .setRequired(true)
                .addChoices(
                    { name: "Weapon", value: "weapon" },
                    { name: "Helmet", value: "helmet" },
                    { name: "Armor", value: "armor" },
                    { name: "Gloves", value: "gloves" },
                    { name: "Boots", value: "boots" },
                    { name: "Accessory 1", value: "accessory1" },
                    { name: "Accessory 2", value: "accessory2" }
                )))
        .addSubcommand(s => s.setName("rest")
            .setDescription("Rest to restore HP and MP"))
        .addSubcommand(s => s.setName("battle")
            .setDescription("Engage in battle with a monster")
            .addStringOption(o => o.setName("difficulty")
                .setDescription("Monster difficulty")
                .setRequired(true)
                .addChoices(
                    { name: "Easy - Level 1-5", value: "easy" },
                    { name: "Normal - Level 5-10", value: "normal" },
                    { name: "Hard - Level 10-15", value: "hard" },
                    { name: "Expert - Level 15+", value: "expert" }
                )))
        .addSubcommand(s => s.setName("leaderboard")
            .setDescription("View the top players")
            .addStringOption(o => o.setName("type")
                .setDescription("Leaderboard type")
                .addChoices(
                    { name: "Level", value: "level" },
                    { name: "Gold", value: "gold" },
                    { name: "Experience", value: "experience" }
                )))
        .addSubcommand(s => s.setName("adventure")
            .setDescription("Embark on an adventure to find items and gold")
            .addStringOption(o => o.setName("type")
                .setDescription("Adventure type")
                .setRequired(true)
                .addChoices(
                    { name: "🌲 Forest Exploration - Easy, find herbs & materials", value: "forest" },
                    { name: "⛏️ Mine Expedition - Moderate, find ores & gems", value: "mine" },
                    { name: "🏛️ Dungeon Raid - Hard, find rare equipment", value: "dungeon" },
                    { name: "🏴‍☠️ Treasure Hunt - High risk, high reward", value: "treasure" }
                )))
        .addSubcommand(s => s.setName("work")
            .setDescription("Take on a job to earn gold")
            .addStringOption(o => o.setName("job")
                .setDescription("Job type")
                .setRequired(true)
                .addChoices(
                    { name: "🛡️ Guard Duty - Low risk, steady income", value: "guard" },
                    { name: "📦 Merchant Escort - Medium risk, good pay", value: "escort" },
                    { name: "🎯 Bounty Hunter - High risk, great rewards", value: "bounty" },
                    { name: "⚗️ Alchemy - Craft potions for profit", value: "alchemy" }
                )))
        .addSubcommand(s => s.setName("gather")
            .setDescription("Gather resources from the environment")
            .addStringOption(o => o.setName("resource")
                .setDescription("Resource to gather")
                .setRequired(true)
                .addChoices(
                    { name: "🌿 Herbs - For alchemy", value: "herbs" },
                    { name: "🪵 Wood - For crafting", value: "wood" },
                    { name: "🪨 Stone - For construction", value: "stone" },
                    { name: "🐟 Fish - For food", value: "fish" }
                )))
        .addSubcommand(s => s.setName("market")
            .setDescription("Visit the player marketplace")
            .addStringOption(o => o.setName("action")
                .setDescription("Market action")
                .setRequired(true)
                .addChoices(
                    { name: "Browse Listings", value: "browse" },
                    { name: "List Item for Sale", value: "sell" },
                    { name: "My Listings", value: "mylistings" }
                ))
            .addIntegerOption(o => o.setName("item_id")
                .setDescription("Item ID (for listing items)")
                .setRequired(false))
            .addIntegerOption(o => o.setName("price")
                .setDescription("Price in gold (for listing items)")
                .setRequired(false))
            .addIntegerOption(o => o.setName("listing_id")
                .setDescription("Listing ID (for buying)")
                .setRequired(false)))
        .addSubcommand(s => s.setName("quest")
            .setDescription("View and complete quests")
            .addStringOption(o => o.setName("action")
                .setDescription("Quest action")
                .setRequired(true)
                .addChoices(
                    { name: "Available Quests", value: "available" },
                    { name: "Active Quests", value: "active" },
                    { name: "Accept Quest", value: "accept" },
                    { name: "Complete Quest", value: "complete" }
                ))
            .addIntegerOption(o => o.setName("quest_id")
                .setDescription("Quest ID")
                .setRequired(false)))
        .addSubcommand(s => s.setName("gamble")
            .setDescription("Try your luck at gambling")
            .addStringOption(o => o.setName("game")
                .setDescription("Gambling game")
                .setRequired(true)
                .addChoices(
                    { name: "🎲 Dice Roll - Bet on high roll", value: "dice" },
                    { name: "🃏 Card Draw - Bet on card value", value: "cards" },
                    { name: "🎰 Slot Machine - Random rewards", value: "slots" }
                ))
            .addIntegerOption(o => o.setName("bet")
                .setDescription("Amount to bet (gold)")
                .setRequired(true)
                .setMinValue(10))),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const sub = interaction.options.getSubcommand();
        
        if (sub === "create") {
            const session = await getSession(interaction.user.id);
            if (!session) {
                return interaction.editReply("❌ You need to log in first! Use `/login` to access your account.");
            }

            const existingChar = await getCharacter(session.account_id);
            if (existingChar) {
                return interaction.editReply("❌ You already have a character! Use `/rpg profile` to view it.");
            }

            const name = interaction.options.getString("name", true);
            const classType = interaction.options.getString("class", true);
            const classData = CLASSES[classType as keyof typeof CLASSES];

            const nameCheck: any = await db.query("SELECT * FROM rpg_characters WHERE name = ?", [name]);
            if (nameCheck.length > 0) {
                return interaction.editReply("❌ This character name is already taken!");
            }

            await db.query("INSERT INTO rpg_characters SET ?", [{
                account_id: session.account_id,
                uid: interaction.user.id,
                name: name,
                class: classType,
                level: 1,
                experience: 0,
                hp: classData.stats.hp,
                max_hp: classData.stats.hp,
                mp: classData.stats.mp,
                max_mp: classData.stats.mp,
                strength: classData.stats.str,
                defense: classData.stats.def,
                agility: classData.stats.agi,
                intelligence: classData.stats.int,
                luck: classData.stats.luk,
                stat_points: 0,
                gold: 100,
                created_at: Date.now(),
                last_action: Date.now()
            }]);

            const createEmbed = new EmbedBuilder()
                .setColor("#FFD700")
                .setTitle(`${classData.emoji} Character Created!`)
                .setDescription(`Welcome to the realm, **${name}**!`)
                .addFields(
                    { name: "Class", value: `${classData.emoji} ${classData.name}`, inline: true },
                    { name: "Level", value: "1", inline: true },
                    { name: "Starting Gold", value: "💰 100", inline: true },
                    { name: "HP", value: `❤️ ${classData.stats.hp}`, inline: true },
                    { name: "MP", value: `💙 ${classData.stats.mp}`, inline: true },
                    { name: "⚡", value: "\u200b", inline: true },
                    { name: "Base Stats", value: `**STR:** ${classData.stats.str} | **DEF:** ${classData.stats.def} | **AGI:** ${classData.stats.agi}\n**INT:** ${classData.stats.int} | **LUK:** ${classData.stats.luk}`, inline: false },
                    { name: "Class Info", value: classData.description, inline: false }
                )
                .setFooter({ text: "Your adventure begins now! Use /rpg profile to see your stats" })
                .setTimestamp();

            return interaction.editReply({ embeds: [createEmbed], content: "" });
        }

        const session = await getSession(interaction.user.id);
        if (!session) {
            return interaction.editReply("❌ You need to log in first! Use `/login` to access your account.");
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return interaction.editReply("❌ You need to create a character first! Use `/rpg create` to begin your adventure.");
        }

        switch (sub) {
            case "profile": {
                const classData = CLASSES[character.class as keyof typeof CLASSES];
                const expNeeded = Math.floor(100 * Math.pow(1.5, character.level - 1));
                const expProgress = Math.floor((character.experience / expNeeded) * 20);
                const progressBar = "▰".repeat(expProgress) + "▱".repeat(20 - expProgress);

                const equipped: any = await db.query(
                    `SELECT e.slot, i.name FROM rpg_equipped_items e 
                    JOIN rpg_items i ON e.item_id = i.id 
                    WHERE e.character_id = ?`,
                    [character.id]
                );

                const equipmentText = equipped.length > 0 
                    ? equipped.map((e: any) => `**${e.slot}:** ${e.name}`).join("\n")
                    : "No equipment";

                const totalStats = {
                    str: character.strength,
                    def: character.defense,
                    agi: character.agility,
                    int: character.intelligence,
                    luk: character.luck
                };

                for (const eq of equipped) {
                    const eqData: any = await db.query("SELECT * FROM rpg_equipment WHERE item_id = (SELECT id FROM rpg_items WHERE name = ?)", [eq.name]);
                    if (eqData[0]) {
                        totalStats.str += eqData[0].strength_bonus;
                        totalStats.def += eqData[0].defense_bonus;
                        totalStats.agi += eqData[0].agility_bonus;
                        totalStats.int += eqData[0].intelligence_bonus;
                        totalStats.luk += eqData[0].luck_bonus;
                    }
                }

                const profileEmbed = new EmbedBuilder()
                    .setColor("#9B59B6")
                    .setTitle(`${classData.emoji} ${character.name}`)
                    .setDescription(`**${classData.name}** • Level ${character.level}`)
                    .addFields(
                        { name: "💰 Gold", value: character.gold.toLocaleString(), inline: true },
                        { name: "❤️ HP", value: `${character.hp}/${character.max_hp}`, inline: true },
                        { name: "💙 MP", value: `${character.mp}/${character.max_mp}`, inline: true },
                        { name: "📊 Experience", value: `${character.experience}/${expNeeded}\n${progressBar}`, inline: false },
                        { name: "⚔️ Combat Stats", value: `**STR:** ${totalStats.str} | **DEF:** ${totalStats.def} | **AGI:** ${totalStats.agi}\n**INT:** ${totalStats.int} | **LUK:** ${totalStats.luk}`, inline: false },
                        { name: "📦 Equipment", value: equipmentText, inline: false }
                    )
                    .setFooter({ text: `Stat Points Available: ${character.stat_points}` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [profileEmbed], content: "" });
            }

            case "stats": {
                const action = interaction.options.getString("action", true);

                if (action === "view") {
                    const statsEmbed = new EmbedBuilder()
                        .setColor("#3498DB")
                        .setTitle("📊 Character Statistics")
                        .setDescription(`**${character.name}** - Level ${character.level}`)
                        .addFields(
                            { name: "⚔️ Strength", value: `${character.strength}\n*Increases physical damage*`, inline: true },
                            { name: "🛡️ Defense", value: `${character.defense}\n*Reduces damage taken*`, inline: true },
                            { name: "⚡ Agility", value: `${character.agility}\n*Increases critical rate & evasion*`, inline: true },
                            { name: "🔮 Intelligence", value: `${character.intelligence}\n*Increases magic damage*`, inline: true },
                            { name: "🍀 Luck", value: `${character.luck}\n*Increases item drop rate & critical damage*`, inline: true },
                            { name: "✨ Available Points", value: `${character.stat_points}`, inline: true }
                        )
                        .setFooter({ text: "Use /rpg stats allocate to distribute your points" })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [statsEmbed], content: "" });
                }

                if (action === "allocate") {
                    const stat = interaction.options.getString("stat");
                    const points = interaction.options.getInteger("points");

                    if (!stat || !points) {
                        return interaction.editReply("❌ Please specify both stat and points to allocate!");
                    }

                    if (character.stat_points < points) {
                        return interaction.editReply(`❌ You only have ${character.stat_points} stat points available!`);
                    }

                    await db.query(
                        `UPDATE rpg_characters SET ${stat} = ${stat} + ?, stat_points = stat_points - ? WHERE id = ?`,
                        [points, points, character.id]
                    );

                    const statIcons: any = {
                        strength: "⚔️",
                        defense: "🛡️",
                        agility: "⚡",
                        intelligence: "🔮",
                        luck: "🍀"
                    };

                    const allocateEmbed = new EmbedBuilder()
                        .setColor("#2ECC71")
                        .setTitle("✨ Stats Allocated!")
                        .setDescription(`${statIcons[stat]} **${stat.toUpperCase()}** increased by ${points}!`)
                        .addFields(
                            { name: "New Value", value: `${character[stat] + points}`, inline: true },
                            { name: "Remaining Points", value: `${character.stat_points - points}`, inline: true }
                        )
                        .setTimestamp();

                    return interaction.editReply({ embeds: [allocateEmbed], content: "" });
                }
                break;
            }

            case "inventory": {
                const page = interaction.options.getInteger("page") || 1;
                const itemsPerPage = 10;
                const offset = (page - 1) * itemsPerPage;

                const items: any = await db.query(
                    `SELECT inv.id, inv.quantity, i.name, i.description, i.type, i.rarity 
                    FROM rpg_inventory inv 
                    JOIN rpg_items i ON inv.item_id = i.id 
                    WHERE inv.character_id = ? 
                    ORDER BY i.rarity DESC, i.type, i.name 
                    LIMIT ? OFFSET ?`,
                    [character.id, itemsPerPage, offset]
                );

                const totalItems: any = await db.query("SELECT COUNT(*) as count FROM rpg_inventory WHERE character_id = ?", [character.id]);
                const totalPages = Math.ceil(totalItems[0].count / itemsPerPage);

                if (items.length === 0) {
                    return interaction.editReply("📦 Your inventory is empty!");
                }

                const rarityColors: any = {
                    common: "⚪",
                    uncommon: "🟢",
                    rare: "🔵",
                    epic: "🟣",
                    legendary: "🟠",
                    mythic: "🔴"
                };

                const invEmbed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("🎒 Inventory")
                    .setDescription(`**${character.name}**'s belongings\nPage ${page}/${totalPages || 1}`)
                    .setFooter({ text: `Total items: ${totalItems[0].count}` })
                    .setTimestamp();

                for (const item of items) {
                    const rarity = rarityColors[item.rarity] || "⚪";
                    invEmbed.addFields({
                        name: `${rarity} ${item.name} ${item.quantity > 1 ? `(x${item.quantity})` : ""}`,
                        value: `*${item.type}* • ID: ${item.id}\n${item.description || "No description"}`,
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [invEmbed], content: "" });
            }

            case "equip": {
                const inventoryId = interaction.options.getInteger("item_id", true);

                const invItem: any = await db.query(
                    `SELECT inv.*, i.name, eq.slot, eq.required_level, eq.required_class 
                    FROM rpg_inventory inv 
                    JOIN rpg_items i ON inv.item_id = i.id 
                    LEFT JOIN rpg_equipment eq ON i.id = eq.item_id 
                    WHERE inv.id = ? AND inv.character_id = ?`,
                    [inventoryId, character.id]
                );

                if (!invItem[0]) {
                    return interaction.editReply("❌ Item not found in your inventory!");
                }

                if (!invItem[0].slot) {
                    return interaction.editReply("❌ This item cannot be equipped!");
                }

                if (invItem[0].required_level > character.level) {
                    return interaction.editReply(`❌ You need to be level ${invItem[0].required_level} to equip this item!`);
                }

                if (invItem[0].required_class && invItem[0].required_class !== character.class) {
                    return interaction.editReply(`❌ This item can only be equipped by ${invItem[0].required_class}s!`);
                }

                // Check if this item is already equipped in any slot
                const alreadyEquipped: any = await db.query(
                    "SELECT * FROM rpg_equipped_items WHERE character_id = ? AND item_id = ?",
                    [character.id, invItem[0].item_id]
                );

                if (alreadyEquipped[0]) {
                    return interaction.editReply(`❌ **${invItem[0].name}** is already equipped! Unequip it first before equipping another copy.`);
                }

                const currentEquip: any = await db.query(
                    "SELECT * FROM rpg_equipped_items WHERE character_id = ? AND slot = ?",
                    [character.id, invItem[0].slot]
                );

                if (currentEquip[0]) {
                    await db.query("DELETE FROM rpg_equipped_items WHERE character_id = ? AND slot = ?", [character.id, invItem[0].slot]);
                }

                await db.query("INSERT INTO rpg_equipped_items SET ?", [{
                    character_id: character.id,
                    slot: invItem[0].slot,
                    item_id: invItem[0].item_id,
                    inventory_id: inventoryId,
                    equipped_at: Date.now()
                }]);

                const equipEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle("✅ Item Equipped!")
                    .setDescription(`**${invItem[0].name}** has been equipped in the **${invItem[0].slot}** slot!`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [equipEmbed], content: "" });
            }

            case "unequip": {
                const slot = interaction.options.getString("slot", true);

                const equipped: any = await db.query(
                    "SELECT * FROM rpg_equipped_items WHERE character_id = ? AND slot = ?",
                    [character.id, slot]
                );

                if (!equipped[0]) {
                    return interaction.editReply("❌ No item equipped in that slot!");
                }

                await db.query("DELETE FROM rpg_equipped_items WHERE character_id = ? AND slot = ?", [character.id, slot]);

                return interaction.editReply(`✅ Item unequipped from **${slot}** slot!`);
            }

            case "rest": {
                const lastRest = character.last_action;
                const cooldown = 300000;
                const timeLeft = cooldown - (Date.now() - lastRest);

                if (timeLeft > 0) {
                    const minutes = Math.ceil(timeLeft / 60000);
                    return interaction.editReply(`⏰ You can rest again in ${minutes} minute(s)!`);
                }

                await db.query(
                    "UPDATE rpg_characters SET hp = max_hp, mp = max_mp, last_action = ? WHERE id = ?",
                    [Date.now(), character.id]
                );

                const restEmbed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle("😴 Resting...")
                    .setDescription(`**${character.name}** takes a moment to rest and recover.`)
                    .addFields(
                        { name: "❤️ HP Restored", value: `${character.max_hp}`, inline: true },
                        { name: "💙 MP Restored", value: `${character.max_mp}`, inline: true }
                    )
                    .setFooter({ text: "You feel refreshed and ready for battle!" })
                    .setTimestamp();

                return interaction.editReply({ embeds: [restEmbed], content: "" });
            }

            case "battle": {
                const difficulty = interaction.options.getString("difficulty", true);
                
                const monsters: any = {
                    easy: [
                        { name: "Slime", emoji: "💧", hp: 30, atk: 5, def: 2, exp: 15, gold: 10 },
                        { name: "Goblin", emoji: "👺", hp: 40, atk: 8, def: 3, exp: 20, gold: 15 }
                    ],
                    normal: [
                        { name: "Orc", emoji: "👹", hp: 80, atk: 15, def: 8, exp: 50, gold: 40 },
                        { name: "Wolf", emoji: "🐺", hp: 70, atk: 18, def: 5, exp: 45, gold: 35 }
                    ],
                    hard: [
                        { name: "Troll", emoji: "🧟", hp: 150, atk: 25, def: 15, exp: 100, gold: 80 },
                        { name: "Drake", emoji: "🐉", hp: 180, atk: 30, def: 12, exp: 120, gold: 100 }
                    ],
                    expert: [
                        { name: "Dragon", emoji: "🐲", hp: 300, atk: 45, def: 25, exp: 250, gold: 200 },
                        { name: "Demon", emoji: "😈", hp: 350, atk: 50, def: 20, exp: 300, gold: 250 }
                    ]
                };

                const monsterList = monsters[difficulty];
                const monster = monsterList[Math.floor(Math.random() * monsterList.length)];

                let playerHp = character.hp;
                let monsterHp = monster.hp;
                const battleLog: string[] = [];

                // Get equipped items and calculate total stats with bonuses
                const equipped: any = await db.query(
                    `SELECT e.*, i.name FROM rpg_equipped_items e 
                    JOIN rpg_items i ON e.item_id = i.id 
                    WHERE e.character_id = ?`,
                    [character.id]
                );

                let totalStr = character.strength;
                let totalDef = character.defense;
                let totalAgi = character.agility;
                let totalInt = character.intelligence;
                let totalLuk = character.luck;
                let magicDamageBonus = 0;

                // Apply equipment bonuses
                for (const eq of equipped) {
                    const eqData: any = await db.query(
                        "SELECT * FROM rpg_equipment WHERE item_id = (SELECT id FROM rpg_items WHERE name = ?)",
                        [eq.name]
                    );
                    if (eqData[0]) {
                        totalStr += eqData[0].strength_bonus || 0;
                        totalDef += eqData[0].defense_bonus || 0;
                        totalAgi += eqData[0].agility_bonus || 0;
                        totalInt += eqData[0].intelligence_bonus || 0;
                        totalLuk += eqData[0].luck_bonus || 0;

                        // Check for special effects (e.g., mage staff)
                        if (eqData[0].special_effect) {
                            try {
                                const effects = JSON.parse(eqData[0].special_effect);
                                if (effects.magic_damage_bonus) {
                                    magicDamageBonus += effects.magic_damage_bonus;
                                }
                            } catch (e) {
                                // Invalid JSON, skip
                            }
                        }
                    }
                }

                // Calculate combat stats with equipment bonuses
                const playerAtk = totalStr + Math.floor(Math.random() * 5);
                const playerMagicAtk = totalInt + magicDamageBonus + Math.floor(Math.random() * 5);
                const playerDef = totalDef;
                const critChance = totalLuk / 100;
                const critDamage = 1.5 + (totalLuk / 200); // Higher luck = higher crit damage

                // Mages use intelligence for damage
                const primaryAtk = character.class === "mage" ? playerMagicAtk : playerAtk;

                while (playerHp > 0 && monsterHp > 0) {
                    const isCrit = Math.random() < critChance;
                    const critMultiplier = isCrit ? critDamage : 1;
                    const baseDmg = Math.max(1, primaryAtk - monster.def);
                    const playerDmg = baseDmg * critMultiplier;
                    monsterHp -= Math.floor(playerDmg);
                    
                    const attackEmoji = character.class === "mage" ? "🔮" : "⚔️";
                    battleLog.push(`${attackEmoji} You deal ${Math.floor(playerDmg)} damage${isCrit ? " (CRIT!)" : ""}!`);

                    if (monsterHp <= 0) break;

                    const monsterDmg = Math.max(1, monster.atk - playerDef);
                    playerHp -= monsterDmg;
                    battleLog.push(`💥 ${monster.name} deals ${monsterDmg} damage!`);
                }

                const victory = playerHp > 0;

                if (victory) {
                    const expNeeded = Math.floor(100 * Math.pow(1.5, character.level - 1));
                    const newExp = character.experience + monster.exp;
                    let levelUp = false;
                    let newLevel = character.level;

                    if (newExp >= expNeeded) {
                        levelUp = true;
                        newLevel = character.level + 1;
                    }

                    await db.query(
                        "UPDATE rpg_characters SET hp = ?, experience = ?, level = ?, gold = gold + ?, stat_points = stat_points + ? WHERE id = ?",
                        [Math.max(1, playerHp), newExp, newLevel, monster.gold, levelUp ? 5 : 0, character.id]
                    );

                    const materialDrop = Math.random() < 0.25;
                    let materialText = "";
                    if (materialDrop) {
                        const materials: any = await db.query(
                            "SELECT * FROM rpg_crafting_materials WHERE drop_rate >= ? ORDER BY RAND() LIMIT 1",
                            [Math.random() * 100]
                        );
                        if (materials[0]) {
                            const qty = Math.floor(Math.random() * 3) + 1;
                            const existing: any = await db.query(
                                "SELECT * FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                                [character.id, materials[0].id]
                            );
                            
                            if (existing[0]) {
                                await db.query(
                                    "UPDATE rpg_character_materials SET quantity = quantity + ? WHERE character_id = ? AND material_id = ?",
                                    [qty, character.id, materials[0].id]
                                );
                            } else {
                                await db.query("INSERT INTO rpg_character_materials SET ?", [{
                                    character_id: character.id,
                                    material_id: materials[0].id,
                                    quantity: qty
                                }]);
                            }
                            materialText = `\n🎁 Dropped: ${materials[0].emoji} ${materials[0].name} x${qty}`;
                        }
                    }

                    const victoryEmbed = new EmbedBuilder()
                        .setColor("#2ECC71")
                        .setTitle(`⚔️ Victory! ${monster.emoji}`)
                        .setDescription(`You defeated the **${monster.name}**!${materialText}`)
                        .addFields(
                            { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                            { name: "Rewards", value: `💰 ${monster.gold} Gold\n⭐ ${monster.exp} Experience`, inline: true },
                            { name: "HP Remaining", value: `❤️ ${Math.max(1, playerHp)}/${character.max_hp}`, inline: true }
                        );

                    if (levelUp) {
                        victoryEmbed.addFields({ 
                            name: "🎊 Level Up!", 
                            value: `You are now level **${newLevel}**! +5 stat points gained.`, 
                            inline: false 
                        });
                    }

                    await db.query("INSERT INTO rpg_combat_logs SET ?", [{
                        attacker_id: character.id,
                        defender_id: null,
                        action_type: "monster_battle",
                        damage_dealt: monster.hp,
                        hp_remaining: Math.max(1, playerHp),
                        result: "victory",
                        occurred_at: Date.now()
                    }]);

                    const achProgress: any = await db.query(
                        "SELECT * FROM rpg_character_achievements WHERE character_id = ? AND achievement_id IN (SELECT id FROM rpg_achievements WHERE requirement_type = 'battles_won')",
                        [character.id]
                    );
                    
                    if (achProgress[0]) {
                        await db.query(
                            "UPDATE rpg_character_achievements SET progress = progress + 1 WHERE character_id = ? AND achievement_id = ?",
                            [character.id, achProgress[0].achievement_id]
                        );
                    }

                    return interaction.editReply({ embeds: [victoryEmbed], content: "" });
                } else {
                    await db.query(
                        "UPDATE rpg_characters SET hp = 1 WHERE id = ?",
                        [character.id]
                    );

                    const defeatEmbed = new EmbedBuilder()
                        .setColor("#E74C3C")
                        .setTitle(`💀 Defeat! ${monster.emoji}`)
                        .setDescription(`You were defeated by the **${monster.name}**...`)
                        .addFields(
                            { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                            { name: "Status", value: "You barely survived with 1 HP. Rest to recover!", inline: false }
                        )
                        .setFooter({ text: "Better luck next time!" })
                        .setTimestamp();

                    await db.query("INSERT INTO rpg_combat_logs SET ?", [{
                        attacker_id: character.id,
                        defender_id: null,
                        action_type: "monster_battle",
                        damage_dealt: 0,
                        hp_remaining: 1,
                        result: "defeat",
                        occurred_at: Date.now()
                    }]);

                    return interaction.editReply({ embeds: [defeatEmbed], content: "" });
                }
            }

            case "leaderboard": {
                const type = interaction.options.getString("type") || "level";
                const orderBy = type === "level" ? "level DESC, experience DESC" : `${type} DESC`;

                const topPlayers: any = await db.query(
                    `SELECT name, class, level, gold, experience FROM rpg_characters ORDER BY ${orderBy} LIMIT 10`
                );

                if (topPlayers.length === 0) {
                    return interaction.editReply("📋 No players on the leaderboard yet!");
                }

                const leaderboardEmbed = new EmbedBuilder()
                    .setColor("#FFD700")
                    .setTitle(`🏆 Leaderboard - ${type.charAt(0).toUpperCase() + type.slice(1)}`)
                    .setTimestamp();

                const medals = ["🥇", "🥈", "🥉"];
                topPlayers.forEach((player: any, index: number) => {
                    const classData = CLASSES[player.class as keyof typeof CLASSES];
                    const medal = index < 3 ? medals[index] : `**${index + 1}.**`;
                    const value = type === "level" ? `Level ${player.level}` : 
                                 type === "gold" ? `💰 ${player.gold.toLocaleString()}` :
                                 `⭐ ${player.experience.toLocaleString()}`;
                    
                    leaderboardEmbed.addFields({
                        name: `${medal} ${player.name}`,
                        value: `${classData.emoji} ${classData.name} • ${value}`,
                        inline: false
                    });
                });

                return interaction.editReply({ embeds: [leaderboardEmbed], content: "" });
            }

            case "adventure": {
                const type = interaction.options.getString("type", true);
                const lastAdventure = character.last_action;
                const cooldown = 600000; // 10 minutes
                const timeLeft = cooldown - (Date.now() - lastAdventure);

                if (timeLeft > 0) {
                    const minutes = Math.ceil(timeLeft / 60000);
                    return interaction.editReply(`⏰ You're still recovering from your last adventure! Wait ${minutes} minute(s).`);
                }

                const adventures: any = {
                    forest: {
                        name: "Forest Exploration",
                        emoji: "🌲",
                        description: "You venture into the dense forest...",
                        baseGold: [20, 50],
                        baseExp: [10, 30],
                        items: ["herb", "wood", "berry"],
                        itemChance: 0.6,
                        danger: 0.2
                    },
                    mine: {
                        name: "Mine Expedition",
                        emoji: "⛏️",
                        description: "You descend into the dark mines...",
                        baseGold: [40, 100],
                        baseExp: [25, 60],
                        items: ["iron_ore", "copper_ore", "coal", "gem"],
                        itemChance: 0.5,
                        danger: 0.3
                    },
                    dungeon: {
                        name: "Dungeon Raid",
                        emoji: "🏛️",
                        description: "You explore ancient ruins...",
                        baseGold: [80, 200],
                        baseExp: [50, 120],
                        items: ["rare_weapon", "rare_armor", "ancient_artifact"],
                        itemChance: 0.3,
                        danger: 0.5
                    },
                    treasure: {
                        name: "Treasure Hunt",
                        emoji: "🏴‍☠️",
                        description: "You search for buried treasure...",
                        baseGold: [150, 500],
                        baseExp: [100, 250],
                        items: ["legendary_item", "treasure_map", "gold_chest"],
                        itemChance: 0.2,
                        danger: 0.6
                    }
                };

                const adv = adventures[type];
                const luckBonus = character.luck / 100;
                
                // Danger check
                const dangerRoll = Math.random();
                if (dangerRoll < adv.danger - (character.agility / 200)) {
                    const hpLoss = Math.floor(character.max_hp * 0.2);
                    const newHp = Math.max(1, character.hp - hpLoss);
                    
                    await db.query(
                        "UPDATE rpg_characters SET hp = ?, last_action = ? WHERE id = ?",
                        [newHp, Date.now(), character.id]
                    );

                    const dangerEmbed = new EmbedBuilder()
                        .setColor("#E74C3C")
                        .setTitle(`${adv.emoji} ${adv.name} - Danger!`)
                        .setDescription(`${adv.description}\n\n⚠️ You encountered danger and took ${hpLoss} damage!`)
                        .addFields({ name: "HP", value: `${newHp}/${character.max_hp}`, inline: true })
                        .setFooter({ text: "Be more careful next time!" })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [dangerEmbed], content: "" });
                }

                // Success - calculate rewards
                const goldEarned = Math.floor(
                    Math.random() * (adv.baseGold[1] - adv.baseGold[0]) + adv.baseGold[0]
                ) * (1 + luckBonus);
                
                const expEarned = Math.floor(
                    Math.random() * (adv.baseExp[1] - adv.baseExp[0]) + adv.baseExp[0]
                );

                const itemsFound: string[] = [];
                if (Math.random() < adv.itemChance + luckBonus) {
                    const itemCount = Math.random() < 0.3 ? 2 : 1;
                    for (let i = 0; i < itemCount; i++) {
                        const item = adv.items[Math.floor(Math.random() * adv.items.length)];
                        itemsFound.push(item);
                    }
                }

                // Update character
                const expNeeded = Math.floor(100 * Math.pow(1.5, character.level - 1));
                const newExp = character.experience + expEarned;
                let levelUp = false;
                let newLevel = character.level;

                if (newExp >= expNeeded) {
                    levelUp = true;
                    newLevel = character.level + 1;
                }

                await db.query(
                    "UPDATE rpg_characters SET gold = gold + ?, experience = ?, level = ?, stat_points = stat_points + ?, last_action = ? WHERE id = ?",
                    [Math.floor(goldEarned), newExp, newLevel, levelUp ? 5 : 0, Date.now(), character.id]
                );

                // Add items to inventory
                for (const itemName of itemsFound) {
                    const itemData: any = await db.query(
                        "SELECT * FROM rpg_items WHERE name LIKE ?",
                        [`%${itemName}%`]
                    );
                    
                    if (itemData[0]) {
                        const existing: any = await db.query(
                            "SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?",
                            [character.id, itemData[0].id]
                        );
                        
                        if (existing[0]) {
                            await db.query(
                                "UPDATE rpg_inventory SET quantity = quantity + 1 WHERE character_id = ? AND item_id = ?",
                                [character.id, itemData[0].id]
                            );
                        } else {
                            await db.query("INSERT INTO rpg_inventory SET ?", [{
                                character_id: character.id,
                                item_id: itemData[0].id,
                                quantity: 1
                            }]);
                        }
                    }
                }

                const adventureEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle(`${adv.emoji} ${adv.name} - Success!`)
                    .setDescription(`${adv.description}\n\nYou successfully completed your adventure!`)
                    .addFields(
                        { name: "💰 Gold Earned", value: Math.floor(goldEarned).toLocaleString(), inline: true },
                        { name: "⭐ Experience", value: expEarned.toString(), inline: true },
                        { name: "🎒 Items Found", value: itemsFound.length > 0 ? itemsFound.join(", ") : "None", inline: false }
                    )
                    .setTimestamp();

                if (levelUp) {
                    adventureEmbed.addFields({ 
                        name: "🎊 Level Up!", 
                        value: `You are now level **${newLevel}**! +5 stat points gained.`, 
                        inline: false 
                    });
                }

                return interaction.editReply({ embeds: [adventureEmbed], content: "" });
            }

            case "work": {
                const job = interaction.options.getString("job", true);
                const lastWork = character.last_action;
                const cooldown = 900000; // 15 minutes
                const timeLeft = cooldown - (Date.now() - lastWork);

                if (timeLeft > 0) {
                    const minutes = Math.ceil(timeLeft / 60000);
                    return interaction.editReply(`⏰ You're still working! Wait ${minutes} minute(s) before taking another job.`);
                }

                const jobs: any = {
                    guard: {
                        name: "Guard Duty",
                        emoji: "🛡️",
                        description: "You stand watch at the city gates",
                        payment: [50, 100],
                        exp: [15, 30],
                        requiredStat: "defense",
                        statCheck: 10
                    },
                    escort: {
                        name: "Merchant Escort",
                        emoji: "📦",
                        description: "You escort a merchant caravan",
                        payment: [100, 250],
                        exp: [30, 60],
                        requiredStat: "strength",
                        statCheck: 15
                    },
                    bounty: {
                        name: "Bounty Hunter",
                        emoji: "🎯",
                        description: "You track down a wanted criminal",
                        payment: [200, 500],
                        exp: [60, 120],
                        requiredStat: "agility",
                        statCheck: 20
                    },
                    alchemy: {
                        name: "Alchemy Work",
                        emoji: "⚗️",
                        description: "You craft potions for the local alchemist",
                        payment: [80, 180],
                        exp: [25, 50],
                        requiredStat: "intelligence",
                        statCheck: 12
                    }
                };

                const jobData = jobs[job];
                const playerStat = character[jobData.requiredStat];

                // Stat check for bonus
                const bonus = playerStat >= jobData.statCheck ? 1.5 : 1.0;
                const payment = Math.floor(
                    (Math.random() * (jobData.payment[1] - jobData.payment[0]) + jobData.payment[0]) * bonus
                );
                const exp = Math.floor(
                    (Math.random() * (jobData.exp[1] - jobData.exp[0]) + jobData.exp[0]) * bonus
                );

                await db.query(
                    "UPDATE rpg_characters SET gold = gold + ?, experience = experience + ?, last_action = ? WHERE id = ?",
                    [payment, exp, Date.now(), character.id]
                );

                const workEmbed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle(`${jobData.emoji} ${jobData.name}`)
                    .setDescription(`${jobData.description}\n\n${bonus > 1 ? "✨ **Excellent performance!** Your high stats earned you a bonus!" : "Job completed successfully."}`)
                    .addFields(
                        { name: "💰 Payment", value: payment.toLocaleString(), inline: true },
                        { name: "⭐ Experience", value: exp.toString(), inline: true }
                    )
                    .setFooter({ text: "Come back later for more work!" })
                    .setTimestamp();

                return interaction.editReply({ embeds: [workEmbed], content: "" });
            }

            case "gather": {
                const resource = interaction.options.getString("resource", true);
                const lastGather = character.last_action;
                const cooldown = 300000; // 5 minutes
                const timeLeft = cooldown - (Date.now() - lastGather);

                if (timeLeft > 0) {
                    const minutes = Math.ceil(timeLeft / 60000);
                    return interaction.editReply(`⏰ You're still gathering! Wait ${minutes} minute(s).`);
                }

                const resources: any = {
                    herbs: { name: "Herbs", emoji: "🌿", quantity: [1, 5], gold: [5, 15] },
                    wood: { name: "Wood", emoji: "🪵", quantity: [2, 8], gold: [3, 10] },
                    stone: { name: "Stone", emoji: "🪨", quantity: [1, 4], gold: [8, 20] },
                    fish: { name: "Fish", emoji: "🐟", quantity: [1, 3], gold: [10, 25] }
                };

                const res = resources[resource];
                const luckBonus = character.luck / 100;
                const gathered = Math.floor(
                    (Math.random() * (res.quantity[1] - res.quantity[0]) + res.quantity[0]) * (1 + luckBonus)
                );
                const goldValue = Math.floor(gathered * (Math.random() * (res.gold[1] - res.gold[0]) + res.gold[0]));

                await db.query(
                    "UPDATE rpg_characters SET gold = gold + ?, last_action = ? WHERE id = ?",
                    [goldValue, Date.now(), character.id]
                );

                const gatherEmbed = new EmbedBuilder()
                    .setColor("#27AE60")
                    .setTitle(`${res.emoji} Gathering - ${res.name}`)
                    .setDescription(`You gathered **${gathered}x ${res.name}** worth **${goldValue} gold**!`)
                    .addFields(
                        { name: "💰 Value", value: goldValue.toLocaleString(), inline: true },
                        { name: "📦 Quantity", value: gathered.toString(), inline: true }
                    )
                    .setFooter({ text: "Resources sold automatically to merchants" })
                    .setTimestamp();

                return interaction.editReply({ embeds: [gatherEmbed], content: "" });
            }

            case "market": {
                const action = interaction.options.getString("action", true);

                if (action === "browse") {
                    const listings: any = await db.query(
                        `SELECT m.*, i.name as item_name, i.rarity, c.name as seller_name 
                        FROM rpg_marketplace m 
                        JOIN rpg_items i ON m.item_id = i.id 
                        JOIN rpg_characters c ON m.seller_id = c.id 
                        WHERE m.active = TRUE 
                        ORDER BY m.created_at DESC LIMIT 10`
                    );

                    if (!listings || listings.length === 0) {
                        return interaction.editReply("🏪 The marketplace is empty! List some items for sale.");
                    }

                    const rarityColors: any = {
                        common: "⚪",
                        uncommon: "🟢",
                        rare: "🔵",
                        epic: "🟣",
                        legendary: "🟠",
                        mythic: "🔴"
                    };

                    const marketEmbed = new EmbedBuilder()
                        .setColor("#9B59B6")
                        .setTitle("🏪 Player Marketplace")
                        .setDescription("Browse items listed by other players\n\nUse `/rpg market` with listing ID to purchase")
                        .setTimestamp();

                    for (const listing of listings.slice(0, 10)) {
                        const rarity = rarityColors[listing.rarity] || "⚪";
                        marketEmbed.addFields({
                            name: `${rarity} ${listing.item_name} - 💰 ${listing.price.toLocaleString()}`,
                            value: `Seller: **${listing.seller_name}** | ID: ${listing.id}`,
                            inline: false
                        });
                    }

                    return interaction.editReply({ embeds: [marketEmbed], content: "" });
                }

                if (action === "sell") {
                    const itemId = interaction.options.getInteger("item_id");
                    const price = interaction.options.getInteger("price");

                    if (!itemId || !price) {
                        return interaction.editReply("❌ Please provide both item_id and price to list an item!");
                    }

                    if (price < 1) {
                        return interaction.editReply("❌ Price must be at least 1 gold!");
                    }

                    const invItem: any = await db.query(
                        "SELECT * FROM rpg_inventory WHERE id = ? AND character_id = ?",
                        [itemId, character.id]
                    );

                    if (!invItem[0]) {
                        return interaction.editReply("❌ Item not found in your inventory!");
                    }

                    // Check if item is equipped
                    const equipped: any = await db.query(
                        "SELECT * FROM rpg_equipped_items WHERE inventory_id = ?",
                        [itemId]
                    );

                    if (equipped[0]) {
                        return interaction.editReply("❌ You cannot sell equipped items! Unequip it first.");
                    }

                    // Remove from inventory
                    if (invItem[0].quantity > 1) {
                        await db.query(
                            "UPDATE rpg_inventory SET quantity = quantity - 1 WHERE id = ?",
                            [itemId]
                        );
                    } else {
                        await db.query("DELETE FROM rpg_inventory WHERE id = ?", [itemId]);
                    }

                    // Create listing
                    await db.query("INSERT INTO rpg_marketplace SET ?", [{
                        seller_id: character.id,
                        item_id: invItem[0].item_id,
                        price: price,
                        active: true,
                        created_at: Date.now()
                    }]);

                    return interaction.editReply(`✅ Item listed for **${price} gold**! Other players can now purchase it.`);
                }

                if (action === "mylistings") {
                    const myListings: any = await db.query(
                        `SELECT m.*, i.name as item_name FROM rpg_marketplace m 
                        JOIN rpg_items i ON m.item_id = i.id 
                        WHERE m.seller_id = ? AND m.active = TRUE 
                        ORDER BY m.created_at DESC`,
                        [character.id]
                    );

                    if (!myListings || myListings.length === 0) {
                        return interaction.editReply("📋 You have no active listings.");
                    }

                    const listingsEmbed = new EmbedBuilder()
                        .setColor("#3498DB")
                        .setTitle("📋 Your Marketplace Listings")
                        .setDescription(`You have ${myListings.length} active listing(s)`)
                        .setTimestamp();

                    for (const listing of myListings) {
                        listingsEmbed.addFields({
                            name: `${listing.item_name}`,
                            value: `💰 Price: ${listing.price.toLocaleString()} | ID: ${listing.id}`,
                            inline: false
                        });
                    }

                    return interaction.editReply({ embeds: [listingsEmbed], content: "" });
                }

                // Buy action (with listing_id)
                const listingId = interaction.options.getInteger("listing_id");
                if (!listingId) {
                    return interaction.editReply("❌ Please provide a listing_id to purchase an item!");
                }

                const listing: any = await db.query(
                    `SELECT m.*, i.name as item_name FROM rpg_marketplace m 
                    JOIN rpg_items i ON m.item_id = i.id 
                    WHERE m.id = ? AND m.active = TRUE`,
                    [listingId]
                );

                if (!listing[0]) {
                    return interaction.editReply("❌ Listing not found or no longer available!");
                }

                if (listing[0].seller_id === character.id) {
                    return interaction.editReply("❌ You cannot buy your own listings!");
                }

                if (character.gold < listing[0].price) {
                    return interaction.editReply(`❌ Not enough gold! You need ${listing[0].price} gold.`);
                }

                // Process transaction
                await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [listing[0].price, character.id]);
                await db.query("UPDATE rpg_characters SET gold = gold + ? WHERE id = ?", [listing[0].price, listing[0].seller_id]);
                await db.query("UPDATE rpg_marketplace SET active = FALSE WHERE id = ?", [listingId]);

                // Add item to buyer's inventory
                const existing: any = await db.query(
                    "SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?",
                    [character.id, listing[0].item_id]
                );

                if (existing[0]) {
                    await db.query(
                        "UPDATE rpg_inventory SET quantity = quantity + 1 WHERE character_id = ? AND item_id = ?",
                        [character.id, listing[0].item_id]
                    );
                } else {
                    await db.query("INSERT INTO rpg_inventory SET ?", [{
                        character_id: character.id,
                        item_id: listing[0].item_id,
                        quantity: 1
                    }]);
                }

                return interaction.editReply(`✅ Purchased **${listing[0].item_name}** for **${listing[0].price} gold**!`);
            }

            case "quest": {
                const action = interaction.options.getString("action", true);
                const questId = interaction.options.getInteger("quest_id");

                if (action === "available") {
                    const quests: any = await db.query(
                        `SELECT q.* FROM rpg_quests q 
                        WHERE q.id NOT IN (SELECT quest_id FROM rpg_character_quests WHERE character_id = ?) 
                        AND q.required_level <= ? 
                        ORDER BY q.required_level LIMIT 10`,
                        [character.id, character.level]
                    );

                    if (!quests || quests.length === 0) {
                        return interaction.editReply("📜 No quests available at your level!");
                    }

                    const questEmbed = new EmbedBuilder()
                        .setColor("#F39C12")
                        .setTitle("📜 Available Quests")
                        .setDescription("Accept a quest to start your journey!")
                        .setTimestamp();

                    for (const quest of quests) {
                        questEmbed.addFields({
                            name: `${quest.name} (Level ${quest.required_level})`,
                            value: `${quest.description}\n💰 Reward: ${quest.gold_reward} gold | ⭐ ${quest.exp_reward} exp | ID: ${quest.id}`,
                            inline: false
                        });
                    }

                    return interaction.editReply({ embeds: [questEmbed], content: "" });
                }

                if (action === "active") {
                    const activeQuests: any = await db.query(
                        `SELECT cq.*, q.name, q.description, q.gold_reward, q.exp_reward FROM rpg_character_quests cq 
                        JOIN rpg_quests q ON cq.quest_id = q.id 
                        WHERE cq.character_id = ? AND cq.completed = FALSE`,
                        [character.id]
                    );

                    if (!activeQuests || activeQuests.length === 0) {
                        return interaction.editReply("📋 You have no active quests. Accept some from available quests!");
                    }

                    const activeEmbed = new EmbedBuilder()
                        .setColor("#3498DB")
                        .setTitle("📋 Active Quests")
                        .setDescription("Track your progress!")
                        .setTimestamp();

                    for (const quest of activeQuests) {
                        activeEmbed.addFields({
                            name: quest.name,
                            value: `${quest.description}\nProgress: ${quest.progress}/${quest.requirement}\n💰 ${quest.gold_reward} | ⭐ ${quest.exp_reward} | ID: ${quest.quest_id}`,
                            inline: false
                        });
                    }

                    return interaction.editReply({ embeds: [activeEmbed], content: "" });
                }

                if (action === "accept") {
                    if (!questId) {
                        return interaction.editReply("❌ Please provide a quest_id to accept!");
                    }

                    const quest: any = await db.query("SELECT * FROM rpg_quests WHERE id = ?", [questId]);
                    if (!quest[0]) {
                        return interaction.editReply("❌ Quest not found!");
                    }

                    if (character.level < quest[0].required_level) {
                        return interaction.editReply(`❌ You need to be level ${quest[0].required_level} for this quest!`);
                    }

                    const existing: any = await db.query(
                        "SELECT * FROM rpg_character_quests WHERE character_id = ? AND quest_id = ?",
                        [character.id, questId]
                    );

                    if (existing[0]) {
                        return interaction.editReply("❌ You already have this quest!");
                    }

                    await db.query("INSERT INTO rpg_character_quests SET ?", [{
                        character_id: character.id,
                        quest_id: questId,
                        progress: 0,
                        requirement: quest[0].requirement,
                        completed: false,
                        accepted_at: Date.now()
                    }]);

                    return interaction.editReply(`✅ Quest accepted: **${quest[0].name}**\nCheck your active quests to track progress!`);
                }

                if (action === "complete") {
                    if (!questId) {
                        return interaction.editReply("❌ Please provide a quest_id to complete!");
                    }

                    const charQuest: any = await db.query(
                        `SELECT cq.*, q.name, q.gold_reward, q.exp_reward FROM rpg_character_quests cq 
                        JOIN rpg_quests q ON cq.quest_id = q.id 
                        WHERE cq.character_id = ? AND cq.quest_id = ? AND cq.completed = FALSE`,
                        [character.id, questId]
                    );

                    if (!charQuest[0]) {
                        return interaction.editReply("❌ Quest not found or already completed!");
                    }

                    if (charQuest[0].progress < charQuest[0].requirement) {
                        return interaction.editReply(`❌ Quest not ready! Progress: ${charQuest[0].progress}/${charQuest[0].requirement}`);
                    }

                    await db.query(
                        "UPDATE rpg_character_quests SET completed = TRUE, completed_at = ? WHERE character_id = ? AND quest_id = ?",
                        [Date.now(), character.id, questId]
                    );

                    await db.query(
                        "UPDATE rpg_characters SET gold = gold + ?, experience = experience + ? WHERE id = ?",
                        [charQuest[0].gold_reward, charQuest[0].exp_reward, character.id]
                    );

                    const completeEmbed = new EmbedBuilder()
                        .setColor("#2ECC71")
                        .setTitle("✅ Quest Complete!")
                        .setDescription(`**${charQuest[0].name}** has been completed!`)
                        .addFields(
                            { name: "💰 Gold", value: charQuest[0].gold_reward.toLocaleString(), inline: true },
                            { name: "⭐ Experience", value: charQuest[0].exp_reward.toString(), inline: true }
                        )
                        .setTimestamp();

                    return interaction.editReply({ embeds: [completeEmbed], content: "" });
                }

                break;
            }

            case "gamble": {
                const game = interaction.options.getString("game", true);
                const bet = interaction.options.getInteger("bet", true);

                if (character.gold < bet) {
                    return interaction.editReply("❌ You don't have enough gold to place this bet!");
                }

                if (bet > 1000) {
                    return interaction.editReply("❌ Maximum bet is 1000 gold!");
                }

                const games: any = {
                    dice: {
                        name: "Dice Roll",
                        emoji: "🎲",
                        play: () => {
                            const playerRoll = Math.floor(Math.random() * 6) + 1;
                            const houseRoll = Math.floor(Math.random() * 6) + 1;
                            const win = playerRoll > houseRoll;
                            return {
                                win,
                                multiplier: win ? 2 : 0,
                                message: `You rolled **${playerRoll}** | House rolled **${houseRoll}**`
                            };
                        }
                    },
                    cards: {
                        name: "Card Draw",
                        emoji: "🃏",
                        play: () => {
                            const cards = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
                            const playerCard = cards[Math.floor(Math.random() * cards.length)];
                            const houseCard = cards[Math.floor(Math.random() * cards.length)];
                            const playerValue = cards.indexOf(playerCard);
                            const houseValue = cards.indexOf(houseCard);
                            const win = playerValue > houseValue;
                            return {
                                win,
                                multiplier: win ? 2 : 0,
                                message: `You drew **${playerCard}** | House drew **${houseCard}**`
                            };
                        }
                    },
                    slots: {
                        name: "Slot Machine",
                        emoji: "🎰",
                        play: () => {
                            const symbols = ["🍒", "🍋", "🍊", "🍇", "💎", "⭐", "7️⃣"];
                            const slot1 = symbols[Math.floor(Math.random() * symbols.length)];
                            const slot2 = symbols[Math.floor(Math.random() * symbols.length)];
                            const slot3 = symbols[Math.floor(Math.random() * symbols.length)];
                            
                            let multiplier = 0;
                            if (slot1 === slot2 && slot2 === slot3) {
                                multiplier = slot1 === "7️⃣" ? 10 : slot1 === "💎" ? 5 : 3;
                            } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
                                multiplier = 1.5;
                            }
                            
                            return {
                                win: multiplier > 0,
                                multiplier,
                                message: `${slot1} ${slot2} ${slot3}`
                            };
                        }
                    }
                };

                const gameData = games[game];
                const result = gameData.play();
                
                const winnings = result.win ? Math.floor(bet * result.multiplier) - bet : -bet;
                
                await db.query(
                    "UPDATE rpg_characters SET gold = gold + ? WHERE id = ?",
                    [winnings, character.id]
                );

                const gambleEmbed = new EmbedBuilder()
                    .setColor(result.win ? "#2ECC71" : "#E74C3C")
                    .setTitle(`${gameData.emoji} ${gameData.name}`)
                    .setDescription(result.message)
                    .addFields(
                        { name: "Bet", value: `💰 ${bet}`, inline: true },
                        { name: "Result", value: result.win ? `✅ Won ${Math.abs(winnings)} gold!` : `❌ Lost ${Math.abs(winnings)} gold`, inline: true }
                    )
                    .setFooter({ text: result.win ? "Congratulations!" : "Better luck next time!" })
                    .setTimestamp();

                return interaction.editReply({ embeds: [gambleEmbed], content: "" });
            }
        }
    },
    ephemeral: false
};
