import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import db from "../mysql/database";
import client from "..";
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
        .setName("trade")
        .setDescription("Trade items and gold with other players")
        .addSubcommand(s => s.setName("offer")
            .setDescription("Offer a trade to another player")
            .addUserOption(o => o.setName("player")
                .setDescription("Player to trade with")
                .setRequired(true))
            .addIntegerOption(o => o.setName("gold")
                .setDescription("Gold to offer")
                .setMinValue(0))
            .addIntegerOption(o => o.setName("item1_id")
                .setDescription("First item inventory ID"))
            .addIntegerOption(o => o.setName("item1_quantity")
                .setDescription("Quantity of first item")
                .setMinValue(1))
            .addIntegerOption(o => o.setName("item2_id")
                .setDescription("Second item inventory ID"))
            .addIntegerOption(o => o.setName("item2_quantity")
                .setDescription("Quantity of second item")
                .setMinValue(1)))
        .addSubcommand(s => s.setName("view")
            .setDescription("View your pending trades"))
        .addSubcommand(s => s.setName("cancel")
            .setDescription("Cancel a pending trade")
            .addIntegerOption(o => o.setName("trade_id")
                .setDescription("Trade ID to cancel")
                .setRequired(true)))
        .addSubcommand(s => s.setName("accept")
            .setDescription("Accept a trade offer")
            .addIntegerOption(o => o.setName("trade_id")
                .setDescription("Trade ID to accept")
                .setRequired(true))
            .addIntegerOption(o => o.setName("gold")
                .setDescription("Gold to give in return")
                .setMinValue(0))
            .addIntegerOption(o => o.setName("item1_id")
                .setDescription("First item inventory ID"))
            .addIntegerOption(o => o.setName("item1_quantity")
                .setDescription("Quantity of first item")
                .setMinValue(1))
            .addIntegerOption(o => o.setName("item2_id")
                .setDescription("Second item inventory ID"))
            .addIntegerOption(o => o.setName("item2_quantity")
                .setDescription("Quantity of second item")
                .setMinValue(1)))
        .addSubcommand(s => s.setName("decline")
            .setDescription("Decline a trade offer")
            .addIntegerOption(o => o.setName("trade_id")
                .setDescription("Trade ID to decline")
                .setRequired(true))),
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
            case "offer": {
                const targetUser = interaction.options.getUser("player", true);
                
                if (targetUser.id === interaction.user.id) {
                    return utils.safeInteractionRespond(interaction, "❌ You cannot trade with yourself!");
                }

                if (targetUser.bot) {
                    return utils.safeInteractionRespond(interaction, "❌ You cannot trade with bots!");
                }

                const targetSession = await getSession(targetUser.id);
                if (!targetSession) {
                    return utils.safeInteractionRespond(interaction, "❌ That player is not logged in!");
                }

                const targetCharacter = await getCharacter(targetSession.account_id);
                if (!targetCharacter) {
                    return utils.safeInteractionRespond(interaction, "❌ That player doesn't have a character!");
                }

                const gold = interaction.options.getInteger("gold") || 0;
                const item1Id = interaction.options.getInteger("item1_id");
                const item1Qty = interaction.options.getInteger("item1_quantity") || 1;
                const item2Id = interaction.options.getInteger("item2_id");
                const item2Qty = interaction.options.getInteger("item2_quantity") || 1;

                if (gold === 0 && !item1Id && !item2Id) {
                    return utils.safeInteractionRespond(interaction, "❌ You must offer at least gold or an item!");
                }

                if (gold > character.gold) {
                    return utils.safeInteractionRespond(interaction, `❌ You only have ${character.gold} gold!`);
                }

                const offeredItems: any[] = [];
                
                if (item1Id) {
                    const item: any = await db.query(
                        `SELECT inv.*, i.name, i.tradeable FROM rpg_inventory inv 
                        JOIN rpg_items i ON inv.item_id = i.id 
                        WHERE inv.id = ? AND inv.character_id = ?`,
                        [item1Id, character.id]
                    );
                    
                    if (!item[0]) {
                        return utils.safeInteractionRespond(interaction, `❌ Item ID ${item1Id} not found in your inventory!`);
                    }
                    
                    if (!item[0].tradeable) {
                        return utils.safeInteractionRespond(interaction, `❌ ${item[0].name} cannot be traded!`);
                    }
                    
                    if (item[0].bound) {
                        return utils.safeInteractionRespond(interaction, `❌ ${item[0].name} is bound to you!`);
                    }
                    
                    if (item[0].quantity < item1Qty) {
                        return utils.safeInteractionRespond(interaction, `❌ You only have ${item[0].quantity}x ${item[0].name}!`);
                    }
                    
                    offeredItems.push({ id: item1Id, name: item[0].name, quantity: item1Qty });
                }

                if (item2Id) {
                    const item: any = await db.query(
                        `SELECT inv.*, i.name, i.tradeable FROM rpg_inventory inv 
                        JOIN rpg_items i ON inv.item_id = i.id 
                        WHERE inv.id = ? AND inv.character_id = ?`,
                        [item2Id, character.id]
                    );
                    
                    if (!item[0]) {
                        return utils.safeInteractionRespond(interaction, `❌ Item ID ${item2Id} not found in your inventory!`);
                    }
                    
                    if (!item[0].tradeable) {
                        return utils.safeInteractionRespond(interaction, `❌ ${item[0].name} cannot be traded!`);
                    }
                    
                    if (item[0].bound) {
                        return utils.safeInteractionRespond(interaction, `❌ ${item[0].name} is bound to you!`);
                    }
                    
                    if (item[0].quantity < item2Qty) {
                        return utils.safeInteractionRespond(interaction, `❌ You only have ${item[0].quantity}x ${item[0].name}!`);
                    }
                    
                    offeredItems.push({ id: item2Id, name: item[0].name, quantity: item2Qty });
                }

                await db.query("INSERT INTO rpg_trades SET ?", [{
                    initiator_id: character.id,
                    receiver_id: targetCharacter.id,
                    initiator_gold: gold,
                    initiator_items: JSON.stringify(offeredItems),
                    receiver_gold: 0,
                    receiver_items: JSON.stringify([]),
                    status: "pending",
                    created_at: Date.now()
                }]);

                const tradeId: any = await db.query("SELECT LAST_INSERT_ID() as id");

                let offerText = "";
                if (gold > 0) offerText += `💰 ${gold.toLocaleString()} Gold\n`;
                for (const item of offeredItems) {
                    offerText += `📦 ${item.quantity}x ${item.name}\n`;
                }

                const offerEmbed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle("🤝 Trade Offer Sent!")
                    .setDescription(`You offered a trade to **${targetCharacter.name}**!`)
                    .addFields(
                        { name: "Your Offer", value: offerText || "Nothing", inline: false },
                        { name: "Trade ID", value: `\`${tradeId[0].id}\``, inline: true }
                    )
                    .setFooter({ text: "Waiting for the other player to respond..." })
                    .setTimestamp();

                try {
                    const notifyEmbed = new EmbedBuilder()
                        .setColor("#F39C12")
                        .setTitle("🤝 New Trade Offer!")
                        .setDescription(`**${character.name}** wants to trade with you!`)
                        .addFields(
                            { name: "They Offer", value: offerText || "Nothing", inline: false },
                            { name: "Trade ID", value: `\`${tradeId[0].id}\``, inline: true }
                        )
                        .setFooter({ text: "Use /trade accept or /trade decline" });

                    await targetUser.send({ embeds: [notifyEmbed] });
                } catch {}

                return utils.safeInteractionRespond(interaction, { embeds: [offerEmbed] });
            }

            case "view": {
                const sent: any = await db.query(
                    `SELECT t.*, c.name as receiver_name FROM rpg_trades t 
                    JOIN rpg_characters c ON t.receiver_id = c.id 
                    WHERE t.initiator_id = ? AND t.status = 'pending' 
                    ORDER BY t.created_at DESC LIMIT 5`,
                    [character.id]
                );

                const received: any = await db.query(
                    `SELECT t.*, c.name as initiator_name FROM rpg_trades t 
                    JOIN rpg_characters c ON t.initiator_id = c.id 
                    WHERE t.receiver_id = ? AND t.status = 'pending' 
                    ORDER BY t.created_at DESC LIMIT 5`,
                    [character.id]
                );

                if (sent.length === 0 && received.length === 0) {
                    return utils.safeInteractionRespond(interaction, "📭 You have no pending trades!");
                }

                const viewEmbed = new EmbedBuilder()
                    .setColor("#9B59B6")
                    .setTitle("🤝 Pending Trades")
                    .setTimestamp();

                if (sent.length > 0) {
                    let sentText = "";
                    for (const trade of sent) {
                        const items = JSON.parse(trade.initiator_items);
                        let offer = trade.initiator_gold > 0 ? `💰 ${trade.initiator_gold} ` : "";
                        if (items.length > 0) {
                            offer += items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ");
                        }
                        sentText += `**ID ${trade.id}** to **${trade.receiver_name}**: ${offer || "Nothing"}\n`;
                    }
                    viewEmbed.addFields({ name: "Offers You Sent", value: sentText, inline: false });
                }

                if (received.length > 0) {
                    let receivedText = "";
                    for (const trade of received) {
                        const items = JSON.parse(trade.initiator_items);
                        let offer = trade.initiator_gold > 0 ? `💰 ${trade.initiator_gold} ` : "";
                        if (items.length > 0) {
                            offer += items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ");
                        }
                        receivedText += `**ID ${trade.id}** from **${trade.initiator_name}**: ${offer || "Nothing"}\n`;
                    }
                    viewEmbed.addFields({ name: "Offers You Received", value: receivedText, inline: false });
                }

                return utils.safeInteractionRespond(interaction, { embeds: [viewEmbed] });
            }

            case "cancel": {
                const tradeId = interaction.options.getInteger("trade_id", true);

                const trade: any = await db.query(
                    "SELECT * FROM rpg_trades WHERE id = ? AND initiator_id = ? AND status = 'pending'",
                    [tradeId, character.id]
                );

                if (!trade[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ Trade not found or you cannot cancel it!");
                }

                await db.query("UPDATE rpg_trades SET status = 'cancelled' WHERE id = ?", [tradeId]);

                return utils.safeInteractionRespond(interaction, `✅ Trade #${tradeId} has been cancelled!`);
            }

            case "accept": {
                const tradeId = interaction.options.getInteger("trade_id", true);

                const trade: any = await db.query(
                    "SELECT * FROM rpg_trades WHERE id = ? AND receiver_id = ? AND status = 'pending'",
                    [tradeId, character.id]
                );

                if (!trade[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ Trade not found or already completed!");
                }

                const initiator: any = await db.query("SELECT * FROM rpg_characters WHERE id = ?", [trade[0].initiator_id]);

                const gold = interaction.options.getInteger("gold") || 0;
                const item1Id = interaction.options.getInteger("item1_id");
                const item1Qty = interaction.options.getInteger("item1_quantity") || 1;
                const item2Id = interaction.options.getInteger("item2_id");
                const item2Qty = interaction.options.getInteger("item2_quantity") || 1;

                if (gold > character.gold) {
                    return utils.safeInteractionRespond(interaction, `❌ You only have ${character.gold} gold!`);
                }

                const returnItems: any[] = [];
                
                if (item1Id) {
                    const item: any = await db.query(
                        `SELECT inv.*, i.name, i.tradeable FROM rpg_inventory inv 
                        JOIN rpg_items i ON inv.item_id = i.id 
                        WHERE inv.id = ? AND inv.character_id = ?`,
                        [item1Id, character.id]
                    );
                    
                    if (!item[0] || !item[0].tradeable || item[0].bound || item[0].quantity < item1Qty) {
                        return utils.safeInteractionRespond(interaction, "❌ Invalid item in your return offer!");
                    }
                    
                    returnItems.push({ id: item1Id, name: item[0].name, quantity: item1Qty, item_id: item[0].item_id });
                }

                if (item2Id) {
                    const item: any = await db.query(
                        `SELECT inv.*, i.name, i.tradeable FROM rpg_inventory inv 
                        JOIN rpg_items i ON inv.item_id = i.id 
                        WHERE inv.id = ? AND inv.character_id = ?`,
                        [item2Id, character.id]
                    );
                    
                    if (!item[0] || !item[0].tradeable || item[0].bound || item[0].quantity < item2Qty) {
                        return utils.safeInteractionRespond(interaction, "❌ Invalid item in your return offer!");
                    }
                    
                    returnItems.push({ id: item2Id, name: item[0].name, quantity: item2Qty, item_id: item[0].item_id });
                }

                const initiatorItems = JSON.parse(trade[0].initiator_items);
                
                for (const item of initiatorItems) {
                    const invItem: any = await db.query("SELECT * FROM rpg_inventory WHERE id = ? AND character_id = ?", [item.id, initiator[0].id]);
                    if (!invItem[0] || invItem[0].quantity < item.quantity) {
                        return utils.safeInteractionRespond(interaction, "❌ Initiator no longer has the offered items!");
                    }
                }

                if (initiator[0].gold < trade[0].initiator_gold) {
                    return utils.safeInteractionRespond(interaction, "❌ Initiator no longer has enough gold!");
                }

                for (const item of initiatorItems) {
                    const invItem: any = await db.query("SELECT * FROM rpg_inventory WHERE id = ?", [item.id]);
                    if (invItem[0].quantity <= item.quantity) {
                        await db.query("DELETE FROM rpg_inventory WHERE id = ?", [item.id]);
                    } else {
                        await db.query("UPDATE rpg_inventory SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.id]);
                    }

                    const existingItem: any = await db.query(
                        "SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = (SELECT item_id FROM rpg_items WHERE name = ?)",
                        [character.id, item.name]
                    );

                    if (existingItem[0]) {
                        await db.query("UPDATE rpg_inventory SET quantity = quantity + ? WHERE id = ?", [item.quantity, existingItem[0].id]);
                    } else {
                        await db.query("INSERT INTO rpg_inventory SET ?", [{
                            character_id: character.id,
                            item_id: invItem[0].item_id,
                            quantity: item.quantity,
                            acquired_at: Date.now(),
                            bound: false
                        }]);
                    }
                }

                await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [trade[0].initiator_gold, initiator[0].id]);
                await db.query("UPDATE rpg_characters SET gold = gold + ? WHERE id = ?", [trade[0].initiator_gold, character.id]);

                for (const item of returnItems) {
                    const invItem: any = await db.query("SELECT * FROM rpg_inventory WHERE id = ?", [item.id]);
                    if (invItem[0].quantity <= item.quantity) {
                        await db.query("DELETE FROM rpg_inventory WHERE id = ?", [item.id]);
                    } else {
                        await db.query("UPDATE rpg_inventory SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.id]);
                    }

                    const existingItem: any = await db.query(
                        "SELECT * FROM rpg_inventory WHERE character_id = ? AND item_id = ?",
                        [initiator[0].id, item.item_id]
                    );

                    if (existingItem[0]) {
                        await db.query("UPDATE rpg_inventory SET quantity = quantity + ? WHERE id = ?", [item.quantity, existingItem[0].id]);
                    } else {
                        await db.query("INSERT INTO rpg_inventory SET ?", [{
                            character_id: initiator[0].id,
                            item_id: item.item_id,
                            quantity: item.quantity,
                            acquired_at: Date.now(),
                            bound: false
                        }]);
                    }
                }

                await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [gold, character.id]);
                await db.query("UPDATE rpg_characters SET gold = gold + ? WHERE id = ?", [gold, initiator[0].id]);

                await db.query("UPDATE rpg_trades SET status = 'completed', receiver_gold = ?, receiver_items = ?, completed_at = ? WHERE id = ?", 
                    [gold, JSON.stringify(returnItems), Date.now(), tradeId]);

                const completeEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle("✅ Trade Complete!")
                    .setDescription(`Trade with **${initiator[0].name}** has been completed!`)
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [completeEmbed] });
            }

            case "decline": {
                const tradeId = interaction.options.getInteger("trade_id", true);

                const trade: any = await db.query(
                    "SELECT * FROM rpg_trades WHERE id = ? AND receiver_id = ? AND status = 'pending'",
                    [tradeId, character.id]
                );

                if (!trade[0]) {
                    return utils.safeInteractionRespond(interaction, "❌ Trade not found!");
                }

                await db.query("UPDATE rpg_trades SET status = 'declined' WHERE id = ?", [tradeId]);

                return utils.safeInteractionRespond(interaction, `✅ Trade #${tradeId} has been declined!`);
            }
        }
    },
    ephemeral: false
};
