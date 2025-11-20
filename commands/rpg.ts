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
                ))),
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

            return interaction.editReply({ embeds: [createEmbed] });
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

                return interaction.editReply({ embeds: [profileEmbed] });
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

                    return interaction.editReply({ embeds: [statsEmbed] });
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

                    return interaction.editReply({ embeds: [allocateEmbed] });
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

                return interaction.editReply({ embeds: [invEmbed] });
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

                return interaction.editReply({ embeds: [equipEmbed] });
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

                return interaction.editReply({ embeds: [restEmbed] });
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

                const playerAtk = character.strength + Math.floor(Math.random() * 5);
                const playerDef = character.defense;
                const critChance = character.luck / 100;

                while (playerHp > 0 && monsterHp > 0) {
                    const isCrit = Math.random() < critChance;
                    const playerDmg = Math.max(1, playerAtk - monster.def) * (isCrit ? 1.5 : 1);
                    monsterHp -= Math.floor(playerDmg);
                    battleLog.push(`⚔️ You deal ${Math.floor(playerDmg)} damage${isCrit ? " (CRIT!)" : ""}!`);

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

                    const victoryEmbed = new EmbedBuilder()
                        .setColor("#2ECC71")
                        .setTitle(`⚔️ Victory! ${monster.emoji}`)
                        .setDescription(`You defeated the **${monster.name}**!`)
                        .addFields(
                            { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                            { name: "Rewards", value: `💰 ${monster.gold} Gold\n⭐ ${monster.exp} Experience`, inline: true },
                            { name: "HP Remaining", value: `❤️ ${Math.max(1, playerHp)}/${character.max_hp}`, inline: true }
                        );

                    if (levelUp) {
                        victoryEmbed.addFields({
                            name: "🎉 LEVEL UP!",
                            value: `You reached level **${newLevel}**!\n+5 Stat Points`,
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

                    return interaction.editReply({ embeds: [victoryEmbed] });
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

                    return interaction.editReply({ embeds: [defeatEmbed] });
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

                return interaction.editReply({ embeds: [leaderboardEmbed] });
            }
        }
    },
    ephemeral: false
};
