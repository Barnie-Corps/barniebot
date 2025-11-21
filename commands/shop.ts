import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

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
        .setName("shop")
        .setDescription("Visit the shop to buy items and equipment")
        .addSubcommand(s => s.setName("browse")
            .setDescription("Browse available items")
            .addStringOption(o => o.setName("category")
                .setDescription("Item category")
                .setRequired(true)
                .addChoices(
                    { name: "🧪 Potions", value: "potions" },
                    { name: "⚔️ Weapons", value: "weapons" },
                    { name: "🛡️ Armor", value: "armor" },
                    { name: "💍 Accessories", value: "accessories" }
                )))
        .addSubcommand(s => s.setName("buy")
            .setDescription("Purchase an item")
            .addIntegerOption(o => o.setName("item_id")
                .setDescription("Item ID from shop")
                .setRequired(true))
            .addIntegerOption(o => o.setName("quantity")
                .setDescription("Quantity to buy")
                .setMinValue(1)
                .setMaxValue(99)))
        .addSubcommand(s => s.setName("sell")
            .setDescription("Sell an item from your inventory")
            .addIntegerOption(o => o.setName("inventory_id")
                .setDescription("Inventory item ID")
                .setRequired(true))
            .addIntegerOption(o => o.setName("quantity")
                .setDescription("Quantity to sell")
                .setMinValue(1)
                .setMaxValue(99))),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_logged_in: "You need to log in first! Use ",
                no_character: "You need to create a character first! Use ",
                no_items: "No items available in this category!",
                invalid_item: "Invalid item ID! Use ",
                to_see_items: " to see available items.",
                not_enough_gold: "Not enough gold! You need ",
                but_only_have: " gold but only have ",
                item_not_found: "Item not found in your inventory!",
                cannot_sell: "This item cannot be sold!",
                is_bound: "This item is bound to you and cannot be sold!",
                only_have: "You only have ",
                of_item: " of this item!",
                must_unequip: "You must unequip this item before selling it!"
            },
            browse: {
                welcome: "Welcome, ",
                your_gold: "Your Gold: ",
                use_buy: "Use ",
                to_purchase: " to purchase",
                prices_vary: "Prices may vary based on market conditions"
            },
            buy: {
                title: "Purchase Complete!",
                you_bought: "You bought ",
                total_cost: "Total Cost",
                remaining_gold: "Remaining Gold",
                thank_you: "Thank you for your purchase!"
            },
            sell: {
                title: "Item Sold!",
                you_sold: "You sold ",
                gold_received: "Gold Received",
                new_total: "New Total",
                come_back: "Come back anytime!"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const session = await getSession(interaction.user.id);
        if (!session) {
            return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.not_logged_in + "`/login`.");
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.no_character + "`/rpg create`.");
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "browse": {
                const category = interaction.options.getString("category", true);
                
                const typeMap: Record<string, string> = {
                    potions: "consumable",
                    weapons: "weapon",
                    armor: "armor",
                    accessories: "accessory"
                };

                const items: any = await db.query(
                    "SELECT * FROM rpg_items WHERE type = ? ORDER BY base_value ASC",
                    [typeMap[category]]
                );

                if (items.length === 0) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.no_items);
                }

                const rarityColors: any = {
                    common: "⚪",
                    uncommon: "🟢",
                    rare: "🔵",
                    epic: "🟣",
                    legendary: "🟠"
                };

                const emojiMap: Record<string, string> = {
                    "Health Potion": "❤️",
                    "Mana Potion": "💙",
                    "Greater Health Potion": "💖",
                    "Greater Mana Potion": "💎",
                    "Iron Sword": "⚔️",
                    "Steel Axe": "🪓",
                    "Mage Staff": "🔮",
                    "Hunting Bow": "🏹",
                    "Assassin Dagger": "🗡️",
                    "Leather Armor": "🥋",
                    "Iron Armor": "🛡️",
                    "Mage Robes": "👘",
                    "Helmet": "⛑️",
                    "Boots": "👢",
                    "Lucky Charm": "🍀",
                    "Power Ring": "💍",
                    "Swift Band": "⚡",
                    "Scholar's Amulet": "📿"
                };

                const categoryNames: any = {
                    potions: "🧪 Consumables & Potions",
                    weapons: "⚔️ Weapons",
                    armor: "🛡️ Armor & Protection",
                    accessories: "💍 Accessories & Trinkets"
                };

                const shopEmbed = new EmbedBuilder()
                    .setColor("#F39C12")
                    .setTitle(categoryNames[category])
                    .setDescription(texts.browse.welcome + character.name + "!\n💰 " + texts.browse.your_gold + character.gold.toLocaleString() + "\n\n" + texts.browse.use_buy + "`/shop buy <item_id>`" + texts.browse.to_purchase)
                    .setFooter({ text: texts.browse.prices_vary })
                    .setTimestamp();

                for (const item of items) {
                    const rarity = rarityColors[item.rarity] || "";
                    const emoji = emojiMap[item.name] || "📦";
                    shopEmbed.addFields({
                        name: `${emoji} ${item.name} ${rarity}`,
                        value: `${item.description}\n💰 **${item.base_value} Gold** • ID: \`${item.id}\``,
                        inline: true
                    });
                }

                return utils.safeInteractionRespond(interaction, { embeds: [shopEmbed], content: "" });
            }

            case "buy": {
                const itemId = interaction.options.getInteger("item_id", true);
                const quantity = interaction.options.getInteger("quantity") || 1;

                const shopItem: any = await db.query("SELECT * FROM rpg_items WHERE id = ?", [itemId]);

                if (!shopItem[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.invalid_item + "`/shop browse`" + texts.errors.to_see_items);
                }

                const item = shopItem[0];
                const totalCost = item.base_value * quantity;
                
                if (character.gold < totalCost) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.not_enough_gold + totalCost + texts.errors.but_only_have + character.gold + "!");
                }

                const emojiMap: Record<string, string> = {
                    "Health Potion": "❤️",
                    "Mana Potion": "💙",
                    "Greater Health Potion": "💖",
                    "Greater Mana Potion": "💎",
                    "Iron Sword": "⚔️",
                    "Steel Axe": "🪓",
                    "Mage Staff": "🔮",
                    "Hunting Bow": "🏹",
                    "Assassin Dagger": "🗡️",
                    "Leather Armor": "🥋",
                    "Iron Armor": "🛡️",
                    "Mage Robes": "👘",
                    "Helmet": "⛑️",
                    "Boots": "👢",
                    "Lucky Charm": "🍀",
                    "Power Ring": "💍",
                    "Swift Band": "⚡",
                    "Scholar's Amulet": "📿"
                };

                const existingItem: any = await db.query(
                    "SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?",
                    [character.id, item.id]
                );

                if (existingItem[0] && item.stackable) {
                    await db.query(
                        "UPDATE rpg_inventory SET quantity = quantity + ? WHERE id = ?",
                        [quantity, existingItem[0].id]
                    );
                } else {
                    await db.query("INSERT INTO rpg_inventory SET ?", [{
                        character_id: character.id,
                        item_id: item.id,
                        quantity: quantity,
                        acquired_at: Date.now(),
                        bound: false
                    }]);
                }

                await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [totalCost, character.id]);

                const emoji = emojiMap[item.name] || "📦";
                const purchaseEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle("✅ " + texts.buy.title)
                    .setDescription(texts.buy.you_bought + quantity + "x " + emoji + " " + item.name + "!")
                    .addFields(
                        { name: texts.buy.total_cost, value: "💰 " + totalCost.toLocaleString() + " Gold", inline: true },
                        { name: texts.buy.remaining_gold, value: "💰 " + (character.gold - totalCost).toLocaleString(), inline: true }
                    )
                    .setFooter({ text: texts.buy.thank_you })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [purchaseEmbed], content: "" });
            }

            case "sell": {
                const inventoryId = interaction.options.getInteger("inventory_id", true);
                const quantity = interaction.options.getInteger("quantity") || 1;

                const invItem: any = await db.query(
                    `SELECT inv.*, i.name, i.base_value, i.tradeable, i.stackable 
                    FROM rpg_inventory inv 
                    JOIN rpg_items i ON inv.item_id = i.id 
                    WHERE inv.id = ? AND inv.character_id = ?`,
                    [inventoryId, character.id]
                );

                if (!invItem[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.item_not_found);
                }

                if (!invItem[0].tradeable) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.cannot_sell);
                }

                if (invItem[0].bound) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.is_bound);
                }

                if (invItem[0].quantity < quantity) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.only_have + invItem[0].quantity + texts.errors.of_item);
                }

                const equipped: any = await db.query(
                    "SELECT * FROM rpg_equipped_items WHERE inventory_id = ?",
                    [inventoryId]
                );

                if (equipped[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ " + texts.errors.must_unequip);
                }

                const sellPrice = Math.floor(invItem[0].base_value * 0.5 * quantity);

                if (invItem[0].quantity <= quantity) {
                    await db.query("DELETE FROM rpg_inventory WHERE id = ?", [inventoryId]);
                } else {
                    await db.query("UPDATE rpg_inventory SET quantity = quantity - ? WHERE id = ?", [quantity, inventoryId]);
                }

                await db.query("UPDATE rpg_characters SET gold = gold + ? WHERE id = ?", [sellPrice, character.id]);

                const sellEmbed = new EmbedBuilder()
                    .setColor("#F39C12")
                    .setTitle("💰 " + texts.sell.title)
                    .setDescription(texts.sell.you_sold + quantity + "x " + invItem[0].name + "!")
                    .addFields(
                        { name: texts.sell.gold_received, value: "💰 " + sellPrice.toLocaleString(), inline: true },
                        { name: texts.sell.new_total, value: "💰 " + (character.gold + sellPrice).toLocaleString(), inline: true }
                    )
                    .setFooter({ text: texts.sell.come_back })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [sellEmbed], content: "" });
            }
        }
    },
    ephemeral: false
};
