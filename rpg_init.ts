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
