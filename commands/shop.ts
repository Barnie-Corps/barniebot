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
        const session = await getSession(interaction.user.id);
        if (!session) {
            return utils.safeInteractionRespond(interaction, "❌ You need to log in first! Use `/login` to access your account.");
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, "❌ You need to create a character first! Use `/rpg create` to begin your adventure.");
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
                    return utils.safeInteractionRespond(interaction, "❌ No items available in this category!");
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
                    .setDescription(`**Welcome, ${character.name}!**\n💰 Your Gold: **${character.gold.toLocaleString()}**\n\nUse \`/shop buy <item_id>\` to purchase`)
                    .setFooter({ text: "Prices may vary based on market conditions" })
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
                    return utils.safeInteractionRespond(interaction, "❌ Invalid item ID! Use `/shop browse` to see available items.");
                }

                const item = shopItem[0];
                const totalCost = item.base_value * quantity;
                
                if (character.gold < totalCost) {
                    return utils.safeInteractionRespond(interaction, `❌ Not enough gold! You need **${totalCost}** gold but only have **${character.gold}**!`);
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
                    .setTitle("✅ Purchase Complete!")
                    .setDescription(`You bought **${quantity}x ${emoji} ${item.name}**!`)
                    .addFields(
                        { name: "Total Cost", value: `💰 ${totalCost.toLocaleString()} Gold`, inline: true },
                        { name: "Remaining Gold", value: `💰 ${(character.gold - totalCost).toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: "Thank you for your purchase!" })
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
                    return utils.safeInteractionRespond(interaction, "❌ Item not found in your inventory!");
                }

                if (!invItem[0].tradeable) {
                    return utils.safeInteractionRespond(interaction, "❌ This item cannot be sold!");
                }

                if (invItem[0].bound) {
                    return utils.safeInteractionRespond(interaction, "❌ This item is bound to you and cannot be sold!");
                }

                if (invItem[0].quantity < quantity) {
                    return utils.safeInteractionRespond(interaction, `❌ You only have ${invItem[0].quantity} of this item!`);
                }

                const equipped: any = await db.query(
                    "SELECT * FROM rpg_equipped_items WHERE inventory_id = ?",
                    [inventoryId]
                );

                if (equipped[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ You must unequip this item before selling it!");
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
                    .setTitle("💰 Item Sold!")
                    .setDescription(`You sold **${quantity}x ${invItem[0].name}**!`)
                    .addFields(
                        { name: "Gold Received", value: `💰 ${sellPrice.toLocaleString()}`, inline: true },
                        { name: "New Total", value: `💰 ${(character.gold + sellPrice).toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: "Come back anytime!" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [sellEmbed], content: "" });
            }
        }
    },
    ephemeral: false
};
