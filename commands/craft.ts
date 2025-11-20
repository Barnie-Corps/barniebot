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
        .setName("craft")
        .setDescription("Craft powerful equipment and items")
        .addSubcommand(s => s.setName("recipes")
            .setDescription("View available crafting recipes")
            .addIntegerOption(o => o.setName("page")
                .setDescription("Page number")
                .setMinValue(1)))
        .addSubcommand(s => s.setName("materials")
            .setDescription("View your crafting materials"))
        .addSubcommand(s => s.setName("create")
            .setDescription("Craft an item from a recipe")
            .addIntegerOption(o => o.setName("recipe_id")
                .setDescription("Recipe ID to craft")
                .setRequired(true))),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const session = await getSession(interaction.user.id);
        if (!session) {
            return utils.safeInteractionRespond(interaction, { content: "❌ You need to log in first! Use `/login` to access your account." });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, { content: "❌ You need to create a character first! Use `/rpg create` to begin your adventure." });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "materials") {
            const materials: any = await db.query(
                `SELECT cm.quantity, m.name, m.rarity, m.emoji, m.description 
                FROM rpg_character_materials cm 
                JOIN rpg_crafting_materials m ON cm.material_id = m.id 
                WHERE cm.character_id = ? AND cm.quantity > 0 
                ORDER BY m.rarity DESC, m.name`,
                [character.id]
            );

            if (materials.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "🔧 You don't have any crafting materials yet. Defeat monsters to collect them!" });
            }

            const embed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle("🔧 Crafting Materials")
                .setDescription(`**${character.name}**'s material storage`)
                .setTimestamp();

            const rarityColors: any = {
                common: "⚪",
                uncommon: "🟢",
                rare: "🔵",
                epic: "🟣",
                legendary: "🟠"
            };

            for (const mat of materials) {
                embed.addFields({
                    name: `${rarityColors[mat.rarity]} ${mat.emoji} ${mat.name} x${mat.quantity}`,
                    value: `*${mat.description || "Crafting material"}*`,
                    inline: true
                });
            }

            embed.setFooter({ text: "Use /craft recipes to see what you can make!" });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "recipes") {
            const page = interaction.options.getInteger("page") || 1;
            const recipesPerPage = 5;
            const offset = (page - 1) * recipesPerPage;

            const recipes: any = await db.query(
                `SELECT r.*, i.name as item_name, i.rarity 
                FROM rpg_crafting_recipes r 
                JOIN rpg_items i ON r.result_item_id = i.id 
                ORDER BY r.required_level, i.rarity DESC 
                LIMIT ? OFFSET ?`,
                [recipesPerPage, offset]
            );

            const totalRecipes: any = await db.query("SELECT COUNT(*) as count FROM rpg_crafting_recipes");
            const totalPages = Math.ceil(totalRecipes[0].count / recipesPerPage);

            if (recipes.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "📜 No recipes found on this page." });
            }

            const embed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle("📜 Crafting Recipes")
                .setDescription(`Page ${page}/${totalPages || 1}`)
                .setTimestamp();

            for (const recipe of recipes) {
                const canCraft = character.level >= recipe.required_level;
                const statusIcon = canCraft ? "✅" : "🔒";

                const materials = [];
                
                if (recipe.material_1_id) {
                    const mat: any = await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_1_id]);
                    const owned: any = await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_1_id]
                    );
                    const ownedQty = owned[0]?.quantity || 0;
                    const hasEnough = ownedQty >= recipe.material_1_qty;
                    materials.push(`${hasEnough ? "✅" : "❌"} ${mat[0].emoji} ${mat[0].name} ${ownedQty}/${recipe.material_1_qty}`);
                }

                if (recipe.material_2_id) {
                    const mat: any = await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_2_id]);
                    const owned: any = await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_2_id]
                    );
                    const ownedQty = owned[0]?.quantity || 0;
                    const hasEnough = ownedQty >= recipe.material_2_qty;
                    materials.push(`${hasEnough ? "✅" : "❌"} ${mat[0].emoji} ${mat[0].name} ${ownedQty}/${recipe.material_2_qty}`);
                }

                if (recipe.material_3_id) {
                    const mat: any = await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_3_id]);
                    const owned: any = await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_3_id]
                    );
                    const ownedQty = owned[0]?.quantity || 0;
                    const hasEnough = ownedQty >= recipe.material_3_qty;
                    materials.push(`${hasEnough ? "✅" : "❌"} ${mat[0].emoji} ${mat[0].name} ${ownedQty}/${recipe.material_3_qty}`);
                }

                embed.addFields({
                    name: `${statusIcon} [${recipe.id}] ${recipe.name}`,
                    value: `Creates: **${recipe.item_name}** (${recipe.rarity})\n` +
                           `Level Required: ${recipe.required_level}\n` +
                           `Materials:\n${materials.join("\n")}\n` +
                           `💰 Gold Cost: ${recipe.gold_cost} | Success Rate: ${recipe.success_rate}%`,
                    inline: false
                });
            }

            embed.setFooter({ text: `Use /craft create <recipe_id> to craft | Page ${page}/${totalPages}` });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "create") {
            const recipeId = interaction.options.getInteger("recipe_id", true);

            const recipe: any = await db.query(
                `SELECT r.*, i.name as item_name, i.rarity 
                FROM rpg_crafting_recipes r 
                JOIN rpg_items i ON r.result_item_id = i.id 
                WHERE r.id = ?`,
                [recipeId]
            );

            if (!recipe[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Recipe not found!" });
            }

            const r = recipe[0];

            if (character.level < r.required_level) {
                return utils.safeInteractionRespond(interaction, { content: `❌ You need to be level ${r.required_level} to craft this!` });
            }

            if (character.gold < r.gold_cost) {
                return utils.safeInteractionRespond(interaction, { content: `❌ You need ${r.gold_cost} gold to craft this!` });
            }

            const requiredMaterials = [
                { id: r.material_1_id, qty: r.material_1_qty },
                { id: r.material_2_id, qty: r.material_2_qty },
                { id: r.material_3_id, qty: r.material_3_qty }
            ].filter(m => m.id !== null);

            for (const mat of requiredMaterials) {
                const owned: any = await db.query(
                    "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                    [character.id, mat.id]
                );

                if (!owned[0] || owned[0].quantity < mat.qty) {
                    const matInfo: any = await db.query("SELECT name FROM rpg_crafting_materials WHERE id = ?", [mat.id]);
                    return utils.safeInteractionRespond(interaction, { 
                        content: `❌ You don't have enough **${matInfo[0].name}**! Need: ${mat.qty}, Have: ${owned[0]?.quantity || 0}` 
                    });
                }
            }

            const success = Math.random() * 100 <= r.success_rate;

            await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [r.gold_cost, character.id]);

            for (const mat of requiredMaterials) {
                await db.query(
                    "UPDATE rpg_character_materials SET quantity = quantity - ? WHERE character_id = ? AND material_id = ?",
                    [mat.qty, character.id, mat.id]
                );
            }

            if (success) {
                await db.query("INSERT INTO rpg_inventory SET ?", [{
                    character_id: character.id,
                    item_id: r.result_item_id,
                    quantity: 1,
                    acquired_at: Date.now(),
                    bound: false
                }]);

                const embed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle("✨ Crafting Success!")
                    .setDescription(`**${character.name}** successfully crafted **${r.item_name}**!`)
                    .addFields(
                        { name: "Item", value: `${r.item_name} (${r.rarity})`, inline: true },
                        { name: "Success Rate", value: `${r.success_rate}%`, inline: true }
                    )
                    .setFooter({ text: "Check your inventory with /rpg inventory" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            } else {
                const embed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("💥 Crafting Failed!")
                    .setDescription(`**${character.name}** failed to craft **${r.item_name}**...`)
                    .addFields(
                        { name: "Materials Lost", value: "All materials were consumed in the attempt.", inline: false },
                        { name: "Success Rate", value: `${r.success_rate}%`, inline: true }
                    )
                    .setFooter({ text: "Better luck next time!" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            }
        }
    },
    ephemeral: false
};
