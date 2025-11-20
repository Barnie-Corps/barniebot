import db from "./mysql/database";
import Log from "./Log";

export async function initializeShopItems() {
    try {
        const existingItems: any = await db.query("SELECT COUNT(*) as count FROM rpg_items");
        
        if (existingItems[0].count > 0) {
            Log.info("Shop items already initialized", { component: "RPG" });
            return;
        }

        const items = [
            { name: "Health Potion", description: "Restores 50 HP", type: "consumable", rarity: "common", base_value: 25, tradeable: true, stackable: true, max_stack: 99 },
            { name: "Mana Potion", description: "Restores 30 MP", type: "consumable", rarity: "common", base_value: 20, tradeable: true, stackable: true, max_stack: 99 },
            { name: "Greater Health Potion", description: "Restores 150 HP", type: "consumable", rarity: "uncommon", base_value: 60, tradeable: true, stackable: true, max_stack: 99 },
            { name: "Greater Mana Potion", description: "Restores 100 MP", type: "consumable", rarity: "uncommon", base_value: 50, tradeable: true, stackable: true, max_stack: 99 },
            { name: "Iron Sword", description: "A basic sword", type: "weapon", rarity: "common", base_value: 150, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Steel Axe", description: "Heavy weapon", type: "weapon", rarity: "uncommon", base_value: 250, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Mage Staff", description: "Arcane focus", type: "weapon", rarity: "uncommon", base_value: 200, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Hunting Bow", description: "Swift strikes", type: "weapon", rarity: "uncommon", base_value: 220, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Assassin Dagger", description: "Critical strikes", type: "weapon", rarity: "rare", base_value: 300, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Leather Armor", description: "Light protection", type: "armor", rarity: "common", base_value: 100, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Iron Armor", description: "Solid defense", type: "armor", rarity: "uncommon", base_value: 200, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Mage Robes", description: "Magical attire", type: "armor", rarity: "uncommon", base_value: 180, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Helmet", description: "Head protection", type: "armor", rarity: "common", base_value: 120, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Boots", description: "Swift movement", type: "armor", rarity: "common", base_value: 90, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Lucky Charm", description: "Increases luck", type: "accessory", rarity: "rare", base_value: 300, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Power Ring", description: "Raw strength", type: "accessory", rarity: "uncommon", base_value: 250, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Swift Band", description: "Speed boost", type: "accessory", rarity: "uncommon", base_value: 250, tradeable: true, stackable: false, max_stack: 1 },
            { name: "Scholar's Amulet", description: "Wisdom boost", type: "accessory", rarity: "rare", base_value: 280, tradeable: true, stackable: false, max_stack: 1 }
        ];

        for (const item of items) {
            await db.query("INSERT INTO rpg_items SET ?", [item]);
        }

        const equipmentData = [
            { item_name: "Iron Sword", slot: "weapon", required_level: 1, strength_bonus: 10 },
            { item_name: "Steel Axe", slot: "weapon", required_level: 5, strength_bonus: 15, agility_bonus: -5 },
            { item_name: "Mage Staff", slot: "weapon", required_level: 5, required_class: "mage", intelligence_bonus: 12, mp_bonus: 5 },
            { item_name: "Hunting Bow", slot: "weapon", required_level: 5, required_class: "archer", strength_bonus: 8, agility_bonus: 10 },
            { item_name: "Assassin Dagger", slot: "weapon", required_level: 10, required_class: "rogue", agility_bonus: 15, luck_bonus: 10 },
            { item_name: "Leather Armor", slot: "armor", required_level: 1, defense_bonus: 8 },
            { item_name: "Iron Armor", slot: "armor", required_level: 5, required_class: "warrior", defense_bonus: 15, agility_bonus: -3 },
            { item_name: "Mage Robes", slot: "armor", required_level: 5, required_class: "mage", defense_bonus: 5, intelligence_bonus: 10 },
            { item_name: "Helmet", slot: "helmet", required_level: 1, defense_bonus: 10 },
            { item_name: "Boots", slot: "boots", required_level: 1, agility_bonus: 8 },
            { item_name: "Lucky Charm", slot: "accessory1", required_level: 8, luck_bonus: 10 },
            { item_name: "Power Ring", slot: "accessory1", required_level: 5, strength_bonus: 8 },
            { item_name: "Swift Band", slot: "accessory1", required_level: 5, agility_bonus: 8 },
            { item_name: "Scholar's Amulet", slot: "accessory1", required_level: 8, intelligence_bonus: 10 }
        ];

        for (const eq of equipmentData) {
            const item: any = await db.query("SELECT id FROM rpg_items WHERE name = ?", [eq.item_name]);
            if (item[0]) {
                await db.query("INSERT INTO rpg_equipment SET ?", [{
                    item_id: item[0].id,
                    slot: eq.slot,
                    required_level: eq.required_level || 1,
                    required_class: eq.required_class || null,
                    strength_bonus: eq.strength_bonus || 0,
                    defense_bonus: eq.defense_bonus || 0,
                    agility_bonus: eq.agility_bonus || 0,
                    intelligence_bonus: eq.intelligence_bonus || 0,
                    luck_bonus: eq.luck_bonus || 0,
                    hp_bonus: 0,
                    mp_bonus: eq.mp_bonus || 0,
                    special_effect: null
                }]);
            }
        }

        const consumableData = [
            { item_name: "Health Potion", effect_type: "heal_hp", effect_value: 50 },
            { item_name: "Mana Potion", effect_type: "heal_mp", effect_value: 30 },
            { item_name: "Greater Health Potion", effect_type: "heal_hp", effect_value: 150 },
            { item_name: "Greater Mana Potion", effect_type: "heal_mp", effect_value: 100 }
        ];

        for (const cons of consumableData) {
            const item: any = await db.query("SELECT id FROM rpg_items WHERE name = ?", [cons.item_name]);
            if (item[0]) {
                await db.query("INSERT INTO rpg_consumables SET ?", [{
                    item_id: item[0].id,
                    effect_type: cons.effect_type,
                    effect_value: cons.effect_value,
                    duration: 0,
                    cooldown: 0
                }]);
            }
        }

        Log.info("Shop items initialized successfully", { component: "RPG", count: items.length });
    } catch (error: any) {
        console.error("Failed to initialize shop items:", error);
    }
}

export async function initializeRPGData() {
    try {
        const existingAchievements: any = await db.query("SELECT COUNT(*) as count FROM rpg_achievements");
        
        if (existingAchievements[0].count === 0) {
            const achievements = [
                { name: "First Blood", description: "Win your first battle", category: "combat", requirement_type: "battles_won", requirement_value: 1, reward_gold: 100, reward_experience: 50, icon: "⚔️" },
                { name: "Warrior", description: "Win 50 battles", category: "combat", requirement_type: "battles_won", requirement_value: 50, reward_gold: 1000, reward_experience: 500, icon: "🗡️" },
                { name: "Champion", description: "Win 200 battles", category: "combat", requirement_type: "battles_won", requirement_value: 200, reward_gold: 5000, reward_experience: 2000, icon: "👑" },
                { name: "Level 10", description: "Reach level 10", category: "exploration", requirement_type: "level_reached", requirement_value: 10, reward_gold: 500, reward_experience: 0, icon: "📊" },
                { name: "Level 25", description: "Reach level 25", category: "exploration", requirement_type: "level_reached", requirement_value: 25, reward_gold: 2000, reward_experience: 0, icon: "🌟" },
                { name: "Wealthy", description: "Accumulate 10,000 gold", category: "collection", requirement_type: "gold_accumulated", requirement_value: 10000, reward_gold: 1000, reward_experience: 200, icon: "💰" },
                { name: "Guild Founder", description: "Create a guild", category: "social", requirement_type: "guilds_created", requirement_value: 1, reward_gold: 500, reward_experience: 100, icon: "🏰" },
                { name: "Dungeon Explorer", description: "Complete 10 dungeons", category: "exploration", requirement_type: "dungeons_completed", requirement_value: 10, reward_gold: 2000, reward_experience: 1000, icon: "🗺️" },
                { name: "Master Crafter", description: "Craft 50 items", category: "crafting", requirement_type: "items_crafted", requirement_value: 50, reward_gold: 3000, reward_experience: 1500, icon: "🔨" },
                { name: "Pet Collector", description: "Own 5 different pets", category: "collection", requirement_type: "pets_owned", requirement_value: 5, reward_gold: 2500, reward_experience: 800, icon: "🐾" }
            ];

            for (const ach of achievements) {
                await db.query("INSERT INTO rpg_achievements SET ?", [ach]);
            }
            Log.info("Achievements initialized", { component: "RPG" });
        }

        const existingMaterials: any = await db.query("SELECT COUNT(*) as count FROM rpg_crafting_materials");
        
        if (existingMaterials[0].count === 0) {
            const materials = [
                { name: "Iron Ore", description: "Basic metal ore", rarity: "common", stack_size: 999, drop_rate: 25.00, emoji: "⛏️" },
                { name: "Leather Scrap", description: "Tanned animal hide", rarity: "common", stack_size: 999, drop_rate: 30.00, emoji: "🦴" },
                { name: "Magic Dust", description: "Mystical powder", rarity: "uncommon", stack_size: 999, drop_rate: 15.00, emoji: "✨" },
                { name: "Dragon Scale", description: "Rare dragon material", rarity: "rare", stack_size: 99, drop_rate: 5.00, emoji: "🐉" },
                { name: "Mithril Ore", description: "Legendary metal", rarity: "epic", stack_size: 50, drop_rate: 2.00, emoji: "💎" },
                { name: "Phoenix Feather", description: "Mythical bird plume", rarity: "legendary", stack_size: 10, drop_rate: 0.50, emoji: "🔥" },
                { name: "Crystal Shard", description: "Magical crystal fragment", rarity: "uncommon", stack_size: 999, drop_rate: 12.00, emoji: "💠" },
                { name: "Ancient Wood", description: "Petrified timber", rarity: "rare", stack_size: 99, drop_rate: 8.00, emoji: "🌳" }
            ];

            for (const mat of materials) {
                await db.query("INSERT INTO rpg_crafting_materials SET ?", [mat]);
            }
            Log.info("Crafting materials initialized", { component: "RPG" });
        }

        const existingPets: any = await db.query("SELECT COUNT(*) as count FROM rpg_pets");
        
        if (existingPets[0].count === 0) {
            const pets = [
                { name: "Wolf Pup", description: "Loyal canine companion", rarity: "common", base_price: 500, strength_bonus: 3, defense_bonus: 2, agility_bonus: 4, intelligence_bonus: 1, luck_bonus: 2, special_ability: "Increased critical chance", emoji: "🐺" },
                { name: "Fire Drake", description: "Small dragon hatchling", rarity: "rare", base_price: 5000, strength_bonus: 8, defense_bonus: 6, agility_bonus: 5, intelligence_bonus: 7, luck_bonus: 6, special_ability: "Burn damage over time", emoji: "🐲" },
                { name: "Shadow Cat", description: "Mysterious feline", rarity: "uncommon", base_price: 1500, strength_bonus: 4, defense_bonus: 3, agility_bonus: 8, intelligence_bonus: 3, luck_bonus: 7, special_ability: "Increased evasion", emoji: "🐈‍⬛" },
                { name: "Phoenix", description: "Legendary immortal bird", rarity: "legendary", base_price: 25000, strength_bonus: 10, defense_bonus: 10, agility_bonus: 12, intelligence_bonus: 15, luck_bonus: 15, special_ability: "Auto-revive once per battle", emoji: "🔥" },
                { name: "Slime", description: "Cute blob creature", rarity: "common", base_price: 200, strength_bonus: 1, defense_bonus: 4, agility_bonus: 1, intelligence_bonus: 1, luck_bonus: 3, special_ability: "Increased gold drops", emoji: "💧" },
                { name: "Battle Bear", description: "Fierce grizzly", rarity: "uncommon", base_price: 2000, strength_bonus: 7, defense_bonus: 8, agility_bonus: 3, intelligence_bonus: 2, luck_bonus: 4, special_ability: "Increased HP regeneration", emoji: "🐻" }
            ];

            for (const pet of pets) {
                await db.query("INSERT INTO rpg_pets SET ?", [pet]);
            }
            Log.info("Pets initialized", { component: "RPG" });
        }

        const existingDungeons: any = await db.query("SELECT COUNT(*) as count FROM rpg_dungeons");
        
        if (existingDungeons[0].count === 0) {
            const dungeons = [
                { name: "Abandoned Mine", description: "Dark tunnels filled with monsters", required_level: 5, difficulty: "Easy", stages: 3, boss_name: "Mine Overlord", reward_gold_min: 200, reward_gold_max: 500, reward_exp_min: 300, reward_exp_max: 600, cooldown: 3600000 },
                { name: "Haunted Castle", description: "Cursed fortress of the undead", required_level: 10, difficulty: "Normal", stages: 5, boss_name: "Vampire Lord", reward_gold_min: 800, reward_gold_max: 1500, reward_exp_min: 1000, reward_exp_max: 2000, cooldown: 7200000 },
                { name: "Dragon's Lair", description: "Ancient dragon sanctuary", required_level: 20, difficulty: "Hard", stages: 7, boss_name: "Elder Dragon", reward_gold_min: 3000, reward_gold_max: 6000, reward_exp_min: 5000, reward_exp_max: 10000, cooldown: 14400000 },
                { name: "Abyss", description: "Realm of eternal darkness", required_level: 35, difficulty: "Expert", stages: 10, boss_name: "Abyssal Demon", reward_gold_min: 10000, reward_gold_max: 20000, reward_exp_min: 20000, reward_exp_max: 40000, cooldown: 28800000 }
            ];

            for (const dungeon of dungeons) {
                await db.query("INSERT INTO rpg_dungeons SET ?", [dungeon]);
            }
            Log.info("Dungeons initialized", { component: "RPG" });
        }

        Log.success("RPG data initialization complete", { component: "RPG" });
    } catch (error: any) {
        Log.error("Failed to initialize RPG data", new Error(error.message));
    }
}

interface EquipmentData {
    item_name: string;
    slot: string;
    required_level?: number;
    required_class?: string;
    strength_bonus?: number;
    defense_bonus?: number;
    agility_bonus?: number;
    intelligence_bonus?: number;
    luck_bonus?: number;
    mp_bonus?: number;
}

interface ConsumableData {
    item_name: string;
    effect_type: string;
    effect_value: number;
}
