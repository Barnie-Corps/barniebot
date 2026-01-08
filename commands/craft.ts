import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import { RPGSession, RPGCharacter, RPGCraftingMaterial, RPGCraftingRecipe, CountResult } from "../types/interfaces";

async function getSession(userId: string) {
    const session = (await db.query(
        "SELECT s.*, a.username FROM rpg_sessions s JOIN registered_accounts a ON s.account_id = a.id WHERE s.uid = ? AND s.active = TRUE",
        [userId]
    ) as unknown as RPGSession[]);
    return session[0] || null;
}

async function getCharacter(accountId: number) {
    const character = (await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [accountId]) as unknown as RPGCharacter[]);
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
        let texts = {
            errors: {
                not_logged_in: "You need to log in first! Use ",
                no_character: "You need to create a character first! Use ",
                recipe_not_found: "Recipe not found!",
                need_level: "You need to be level ",
                to_craft: " to craft this!",
                need_gold: "You need ",
                gold_to_craft: " gold to craft this!",
                not_enough: "You don't have enough ",
                need: "! Need: ",
                have: ", Have: "
            },
            materials: {
                title: "Crafting Materials",
                storage: "'s material storage",
                no_materials: "You don't have any crafting materials yet. Defeat monsters to collect them!",
                crafting_material: "Crafting material",
                use_recipes: "Use /craft recipes to see what you can make!"
            },
            recipes: {
                title: "Crafting Recipes",
                page: "Page ",
                no_recipes: "No recipes found on this page.",
                creates: "Creates: ",
                level_required: "Level Required: ",
                materials: "Materials:",
                gold_cost: "Gold Cost: ",
                success_rate: "Success Rate: ",
                use_create: "Use /craft create <recipe_id> to craft | Page "
            },
            create: {
                success_title: "Crafting Success!",
                successfully_crafted: " successfully crafted ",
                item: "Item",
                check_inventory: "Check your inventory with /rpg inventory",
                failed_title: "Crafting Failed!",
                failed_to_craft: " failed to craft ",
                materials_lost: "Materials Lost",
                all_consumed: "All materials were consumed in the attempt.",
                better_luck: "Better luck next time!"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const session = await getSession(interaction.user.id);
        if (!session) {
            return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.not_logged_in + "`/login`." });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.no_character + "`/rpg create`." });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "materials") {
            const materials = (await db.query(
                `SELECT cm.quantity, m.name, m.rarity, m.emoji, m.description 
                FROM rpg_character_materials cm 
                JOIN rpg_crafting_materials m ON cm.material_id = m.id 
                WHERE cm.character_id = ? AND cm.quantity > 0 
                ORDER BY m.rarity DESC, m.name`,
                [character.id]
            ) as unknown as any[]);

            if (materials.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "🔧 " + texts.materials.no_materials });
            }

            const embed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle("🔧 " + texts.materials.title)
                .setDescription(character.name + texts.materials.storage)
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

            embed.setFooter({ text: texts.materials.use_recipes });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "recipes") {
            const page = interaction.options.getInteger("page") || 1;
            const recipesPerPage = 5;
            const offset = (page - 1) * recipesPerPage;

            const recipes = (await db.query(
                `SELECT r.*, i.name as item_name, i.rarity 
                FROM rpg_crafting_recipes r 
                JOIN rpg_items i ON r.result_item_id = i.id 
                ORDER BY r.required_level, i.rarity DESC 
                LIMIT ? OFFSET ?`,
                [recipesPerPage, offset]
            ) as unknown as any[]);

            const totalRecipes = (await db.query("SELECT COUNT(*) as count FROM rpg_crafting_recipes") as unknown as CountResult[]);
            const totalPages = Math.ceil(totalRecipes[0].count / recipesPerPage);

            if (recipes.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "📜 " + texts.recipes.no_recipes });
            }

            const embed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle("📜 " + texts.recipes.title)
                .setDescription(texts.recipes.page + page + "/" + (totalPages || 1))
                .setTimestamp();

            for (const recipe of recipes) {
                const canCraft = character.level >= recipe.required_level;
                const statusIcon = canCraft ? "✅" : "🔒";

                const materials = [];
                
                if (recipe.material_1_id) {
                    const mat = (await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_1_id]) as unknown as RPGCraftingMaterial[]);
                    const owned = (await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_1_id]
                    ) as unknown as any[]);
                    const ownedQty = owned[0]?.quantity || 0;
                    const hasEnough = ownedQty >= recipe.material_1_qty;
                    materials.push(`${hasEnough ? "✅" : "❌"} ${mat[0].emoji} ${mat[0].name} ${ownedQty}/${recipe.material_1_qty}`);
                }

                if (recipe.material_2_id) {
                    const mat = (await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_2_id]) as unknown as RPGCraftingMaterial[]);
                    const owned = (await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_2_id]
                    ) as unknown as any[]);
                    const ownedQty = owned[0]?.quantity || 0;
                    const hasEnough = ownedQty >= recipe.material_2_qty;
                    materials.push(`${hasEnough ? "✅" : "❌"} ${mat[0].emoji} ${mat[0].name} ${ownedQty}/${recipe.material_2_qty}`);
                }

                if (recipe.material_3_id) {
                    const mat = (await db.query("SELECT name, emoji FROM rpg_crafting_materials WHERE id = ?", [recipe.material_3_id]) as unknown as RPGCraftingMaterial[]);
                    const owned = (await db.query(
                        "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                        [character.id, recipe.material_3_id]
                    ) as unknown as any[]);
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

            const recipe = (await db.query(
                `SELECT r.*, i.name as item_name, i.rarity 
                FROM rpg_crafting_recipes r 
                JOIN rpg_items i ON r.result_item_id = i.id 
                WHERE r.id = ?`,
                [recipeId]
            ) as unknown as any[]);

            if (!recipe[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.recipe_not_found });
            }

            const r = recipe[0];

            if (character.level < r.required_level) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.need_level + r.required_level + texts.errors.to_craft });
            }

            if (character.gold < r.gold_cost) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.need_gold + r.gold_cost + texts.errors.gold_to_craft });
            }

            const requiredMaterials = [
                { id: r.material_1_id, qty: r.material_1_qty },
                { id: r.material_2_id, qty: r.material_2_qty },
                { id: r.material_3_id, qty: r.material_3_qty }
            ].filter(m => m.id !== null);

            for (const mat of requiredMaterials) {
                const owned = (await db.query(
                    "SELECT quantity FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                    [character.id, mat.id]
                ) as unknown as any[]);

                if (!owned[0] || owned[0].quantity < mat.qty) {
                    const matInfo = (await db.query("SELECT name FROM rpg_crafting_materials WHERE id = ?", [mat.id]) as unknown as RPGCraftingMaterial[]);
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
                    .setTitle("✨ " + texts.create.success_title)
                    .setDescription(character.name + texts.create.successfully_crafted + r.item_name + "!")
                    .addFields(
                        { name: texts.create.item, value: `${r.item_name} (${r.rarity})`, inline: true },
                        { name: texts.recipes.success_rate, value: `${r.success_rate}%`, inline: true }
                    )
                    .setFooter({ text: texts.create.check_inventory })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            } else {
                const embed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("💥 " + texts.create.failed_title)
                    .setDescription(character.name + texts.create.failed_to_craft + r.item_name + "...")
                    .addFields(
                        { name: texts.create.materials_lost, value: texts.create.all_consumed, inline: false },
                        { name: texts.recipes.success_rate, value: `${r.success_rate}%`, inline: true }
                    )
                    .setFooter({ text: texts.create.better_luck })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            }
        }
    },
    ephemeral: false
};
