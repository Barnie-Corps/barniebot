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
        .setName("pet")
        .setDescription("Manage your companion pets")
        .addSubcommand(s => s.setName("list")
            .setDescription("View your pets"))
        .addSubcommand(s => s.setName("equip")
            .setDescription("Equip a pet for bonuses")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setRequired(true)))
        .addSubcommand(s => s.setName("unequip")
            .setDescription("Unequip your active pet"))
        .addSubcommand(s => s.setName("feed")
            .setDescription("Feed your pet to increase happiness")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setRequired(true)))
        .addSubcommand(s => s.setName("info")
            .setDescription("View detailed pet information")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setRequired(true)))
        .addSubcommand(s => s.setName("rename")
            .setDescription("Rename your pet")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setRequired(true))
            .addStringOption(o => o.setName("name")
                .setDescription("New pet name")
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(30))),
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

        if (sub === "list") {
            const pets: any = await db.query(
                `SELECT cp.*, p.emoji, p.rarity, p.strength_bonus, p.defense_bonus, p.agility_bonus, p.intelligence_bonus, p.luck_bonus, p.special_ability 
                FROM rpg_character_pets cp 
                JOIN rpg_pets p ON cp.pet_id = p.id 
                WHERE cp.character_id = ? 
                ORDER BY cp.is_active DESC, cp.level DESC`,
                [character.id]
            );

            if (pets.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "🐾 You don't have any pets yet! Visit the shop to adopt one." });
            }

            const embed = new EmbedBuilder()
                .setColor("#FF69B4")
                .setTitle("🐾 Your Pets")
                .setDescription(`**${character.name}**'s companions`)
                .setTimestamp();

            for (const pet of pets) {
                const activeIcon = pet.is_active ? "⭐" : "";
                const happinessBar = "❤️".repeat(Math.ceil(pet.happiness / 20));
                const rarityColors: any = { common: "⚪", uncommon: "🟢", rare: "🔵", epic: "🟣", legendary: "🟠" };
                
                const bonuses = [];
                if (pet.strength_bonus > 0) bonuses.push(`STR +${pet.strength_bonus}`);
                if (pet.defense_bonus > 0) bonuses.push(`DEF +${pet.defense_bonus}`);
                if (pet.agility_bonus > 0) bonuses.push(`AGI +${pet.agility_bonus}`);
                if (pet.intelligence_bonus > 0) bonuses.push(`INT +${pet.intelligence_bonus}`);
                if (pet.luck_bonus > 0) bonuses.push(`LUK +${pet.luck_bonus}`);

                embed.addFields({
                    name: `${activeIcon} ${pet.emoji} ${pet.name} [${pet.id}]`,
                    value: `${rarityColors[pet.rarity]} Level ${pet.level} | ${happinessBar} ${pet.happiness}/100\n` +
                           `${bonuses.join(" | ")}\n` +
                           `${pet.special_ability ? `✨ ${pet.special_ability}` : ""}`,
                    inline: true
                });
            }

            embed.setFooter({ text: "Use /pet info <id> to view detailed information" });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "equip") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet: any = await db.query(
                "SELECT * FROM rpg_character_pets WHERE id = ? AND character_id = ?",
                [petId, character.id]
            );

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Pet not found!" });
            }

            if (pet[0].is_active) {
                return utils.safeInteractionRespond(interaction, { content: "❌ This pet is already equipped!" });
            }

            await db.query("UPDATE rpg_character_pets SET is_active = FALSE WHERE character_id = ?", [character.id]);
            await db.query("UPDATE rpg_character_pets SET is_active = TRUE WHERE id = ?", [petId]);

            const petInfo: any = await db.query("SELECT * FROM rpg_pets WHERE id = ?", [pet[0].pet_id]);

            return utils.safeInteractionRespond(interaction, { 
                content: `✅ ${petInfo[0].emoji} **${pet[0].name}** is now your active companion!` 
            });
        }

        if (sub === "unequip") {
            const activePet: any = await db.query(
                "SELECT * FROM rpg_character_pets WHERE character_id = ? AND is_active = TRUE",
                [character.id]
            );

            if (!activePet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You don't have an active pet!" });
            }

            await db.query("UPDATE rpg_character_pets SET is_active = FALSE WHERE id = ?", [activePet[0].id]);

            return utils.safeInteractionRespond(interaction, { content: `✅ **${activePet[0].name}** has been unequipped.` });
        }

        if (sub === "feed") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet: any = await db.query(
                "SELECT * FROM rpg_character_pets WHERE id = ? AND character_id = ?",
                [petId, character.id]
            );

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Pet not found!" });
            }

            if (pet[0].happiness >= 100) {
                return utils.safeInteractionRespond(interaction, { content: "❌ This pet is already at maximum happiness!" });
            }

            const feedCost = 50;
            if (character.gold < feedCost) {
                return utils.safeInteractionRespond(interaction, { content: `❌ You need ${feedCost} gold to feed your pet!` });
            }

            const happinessGain = Math.floor(Math.random() * 20) + 10;
            const newHappiness = Math.min(100, pet[0].happiness + happinessGain);

            await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [feedCost, character.id]);
            await db.query(
                "UPDATE rpg_character_pets SET happiness = ?, last_fed = ? WHERE id = ?",
                [newHappiness, Date.now(), petId]
            );

            const petInfo: any = await db.query("SELECT emoji FROM rpg_pets WHERE id = ?", [pet[0].pet_id]);

            return utils.safeInteractionRespond(interaction, { 
                content: `✅ You fed ${petInfo[0].emoji} **${pet[0].name}**! Happiness: ${pet[0].happiness} → ${newHappiness} (+${happinessGain})` 
            });
        }

        if (sub === "info") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet: any = await db.query(
                `SELECT cp.*, p.emoji, p.name as base_name, p.description, p.rarity, p.strength_bonus, p.defense_bonus, 
                p.agility_bonus, p.intelligence_bonus, p.luck_bonus, p.special_ability 
                FROM rpg_character_pets cp 
                JOIN rpg_pets p ON cp.pet_id = p.id 
                WHERE cp.id = ? AND cp.character_id = ?`,
                [petId, character.id]
            );

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Pet not found!" });
            }

            const p = pet[0];
            const expNeeded = 100 * p.level;
            const expProgress = Math.floor((p.experience / expNeeded) * 20);
            const expBar = "▰".repeat(expProgress) + "▱".repeat(20 - expProgress);

            const happinessBar = "❤️".repeat(Math.ceil(p.happiness / 20));

            const embed = new EmbedBuilder()
                .setColor("#FF69B4")
                .setTitle(`${p.emoji} ${p.name}`)
                .setDescription(`*${p.description}*`)
                .addFields(
                    { name: "🎖️ Rarity", value: p.rarity.charAt(0).toUpperCase() + p.rarity.slice(1), inline: true },
                    { name: "📊 Level", value: p.level.toString(), inline: true },
                    { name: "❤️ Happiness", value: `${happinessBar} ${p.happiness}/100`, inline: true },
                    { name: "⭐ Experience", value: `${p.experience}/${expNeeded}\n${expBar}`, inline: false },
                    { name: "💪 Stat Bonuses", value: 
                        `STR: +${p.strength_bonus} | DEF: +${p.defense_bonus} | AGI: +${p.agility_bonus}\n` +
                        `INT: +${p.intelligence_bonus} | LUK: +${p.luck_bonus}`, 
                        inline: false 
                    }
                )
                .setFooter({ text: p.is_active ? "Currently equipped" : "Not equipped" })
                .setTimestamp();

            if (p.special_ability) {
                embed.addFields({ name: "✨ Special Ability", value: p.special_ability, inline: false });
            }

            if (p.last_fed) {
                embed.addFields({ 
                    name: "🍖 Last Fed", 
                    value: `<t:${Math.floor(p.last_fed / 1000)}:R>`, 
                    inline: true 
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "rename") {
            const petId = interaction.options.getInteger("pet_id", true);
            const newName = interaction.options.getString("name", true);

            const pet: any = await db.query(
                "SELECT * FROM rpg_character_pets WHERE id = ? AND character_id = ?",
                [petId, character.id]
            );

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Pet not found!" });
            }

            await db.query("UPDATE rpg_character_pets SET name = ? WHERE id = ?", [newName, petId]);

            return utils.safeInteractionRespond(interaction, { content: `✅ Pet renamed to **${newName}**!` });
        }
    },
    ephemeral: false
};
