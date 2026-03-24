import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, AutocompleteInteraction } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import { RPGPet } from "../types/interfaces";

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
                .setAutocomplete(true)
                .setRequired(true)))
        .addSubcommand(s => s.setName("unequip")
            .setDescription("Unequip your active pet"))
        .addSubcommand(s => s.setName("feed")
            .setDescription("Feed your pet to increase happiness")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setAutocomplete(true)
                .setRequired(true)))
        .addSubcommand(s => s.setName("info")
            .setDescription("View detailed pet information")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setAutocomplete(true)
                .setRequired(true)))
        .addSubcommand(s => s.setName("rename")
            .setDescription("Rename your pet")
            .addIntegerOption(o => o.setName("pet_id")
                .setDescription("Your pet ID")
                .setAutocomplete(true)
                .setRequired(true))
            .addStringOption(o => o.setName("name")
                .setDescription("New pet name")
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(30))),
    category: "RPG",
    autocomplete: async (interaction: AutocompleteInteraction) => {
        const sub = interaction.options.getSubcommand();
        if (!["equip", "feed", "info", "rename"].includes(sub)) return await interaction.respond([]);
        const profile = await utils.getActiveRpgProfile(interaction.user.id);
        if (!profile.character) return await interaction.respond([]);
        const focused = String(interaction.options.getFocused() || "");
        const pets = await db.query(
            "SELECT id, name, level, is_active FROM rpg_character_pets WHERE character_id = ? ORDER BY is_active DESC, level DESC, id DESC LIMIT 25",
            [profile.character.id]
        ) as unknown as Array<{ id: number; name: string; level: number; is_active: boolean }>;
        await interaction.respond(
            pets
                .map(pet => ({
                    name: `#${pet.id} ${pet.name} (Lv ${pet.level})${pet.is_active ? " [active]" : ""}`,
                    value: pet.id
                }))
                .filter(pet => pet.name.toLowerCase().includes(focused.toLowerCase()) || String(pet.value).includes(focused))
                .slice(0, 25)
        );
    },
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_logged_in: "You need to log in first! Use ",
                no_character: "You need to create a character first! Use ",
                pet_not_found: "Pet not found!",
                already_equipped: "This pet is already equipped!",
                no_active_pet: "You don't have an active pet!",
                max_happiness: "This pet is already at maximum happiness!",
                need_gold_feed: "You need ",
                to_feed: " gold to feed your pet!"
            },
            list: {
                title: "Your Pets",
                companions: "'s companions",
                no_pets: "You don't have any pets yet! Visit the shop to adopt one.",
                level: "Level ",
                use_info: "Use /pet info <id> to view detailed information"
            },
            equip: {
                now_active: " is now your active companion!"
            },
            unequip: {
                unequipped: " has been unequipped."
            },
            feed: {
                you_fed: "You fed ",
                happiness: "! Happiness: "
            },
            info: {
                rarity: "Rarity",
                level: "Level",
                happiness: "Happiness",
                experience: "Experience",
                stat_bonuses: "Stat Bonuses",
                special_ability: "Special Ability",
                last_fed: "Last Fed",
                currently_equipped: "Currently equipped",
                not_equipped: "Not equipped"
            },
            rename: {
                renamed: "Pet renamed to ",
                invalid_name: "Pet name can only contain letters, numbers, and spaces!",
                old_name: "Old Name",
                new_name: "New Name"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const profile = await utils.requireActiveRpgProfile(interaction, interaction.user.id, {
            notLoggedIn: "❌ " + texts.errors.not_logged_in + "`/login`.",
            noCharacter: "❌ " + texts.errors.no_character + "`/rpg create`."
        });
        if (!profile) return;
        const { character } = profile;

        const sub = interaction.options.getSubcommand();

        if (sub === "list") {
            const pets = (await db.query(
                `SELECT cp.*, p.emoji, p.rarity, p.strength_bonus, p.defense_bonus, p.agility_bonus, p.intelligence_bonus, p.luck_bonus, p.special_ability 
                FROM rpg_character_pets cp 
                JOIN rpg_pets p ON cp.pet_id = p.id 
                WHERE cp.character_id = ? 
                ORDER BY cp.is_active DESC, cp.level DESC`,
                [character.id]
            ) as unknown as any[]);

            if (pets.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "🐾 " + texts.list.no_pets });
            }

            const embed = new EmbedBuilder()
                .setColor("#FF69B4")
                .setTitle("🐾 " + texts.list.title)
                .setDescription(character.name + texts.list.companions)
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

            embed.setFooter({ text: texts.list.use_info });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "equip") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet = (await db.query(
                "SELECT * FROM rpg_character_pets WHERE id = ? AND character_id = ?",
                [petId, character.id]
            ) as unknown as any[]);

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.pet_not_found });
            }

            if (pet[0].is_active) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.already_equipped });
            }

            await db.query("UPDATE rpg_character_pets SET is_active = FALSE WHERE character_id = ?", [character.id]);
            await db.query("UPDATE rpg_character_pets SET is_active = TRUE WHERE id = ?", [petId]);

            const petInfo = (await db.query("SELECT * FROM rpg_pets WHERE id = ?", [pet[0].pet_id]) as unknown as RPGPet[]);

            return utils.safeInteractionRespond(interaction, { 
                content: "✅ " + petInfo[0].emoji + " " + pet[0].name + texts.equip.now_active
            });
        }

        if (sub === "unequip") {
            const activePet = (await db.query(
                "SELECT * FROM rpg_character_pets WHERE character_id = ? AND is_active = TRUE",
                [character.id]
            ) as unknown as any[]);

            if (!activePet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.no_active_pet });
            }

            await db.query("UPDATE rpg_character_pets SET is_active = FALSE WHERE id = ?", [activePet[0].id]);

            return utils.safeInteractionRespond(interaction, { content: "✅ " + activePet[0].name + texts.unequip.unequipped });
        }

        if (sub === "feed") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet = (await db.query(
                "SELECT * FROM rpg_character_pets WHERE id = ? AND character_id = ?",
                [petId, character.id]
            ) as unknown as any[]);

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.pet_not_found });
            }

            if (pet[0].happiness >= 100) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.max_happiness });
            }

            const feedCost = 50;
            if (character.gold < feedCost) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.need_gold_feed + feedCost + texts.errors.to_feed });
            }

            const happinessGain = Math.floor(Math.random() * 20) + 10;
            const newHappiness = Math.min(100, pet[0].happiness + happinessGain);

            await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [feedCost, character.id]);
            await db.query(
                "UPDATE rpg_character_pets SET happiness = ?, last_fed = ? WHERE id = ?",
                [newHappiness, Date.now(), petId]
            );

            const petInfo = (await db.query("SELECT emoji FROM rpg_pets WHERE id = ?", [pet[0].pet_id]) as unknown as RPGPet[]);

            return utils.safeInteractionRespond(interaction, { 
                content: "✅ " + texts.feed.you_fed + petInfo[0].emoji + " " + pet[0].name + texts.feed.happiness + pet[0].happiness + " → " + newHappiness + " (+" + happinessGain + ")" 
            });
        }

        if (sub === "info") {
            const petId = interaction.options.getInteger("pet_id", true);

            const pet = (await db.query(
                `SELECT cp.*, p.emoji, p.name as base_name, p.description, p.rarity, p.strength_bonus, p.defense_bonus, 
                p.agility_bonus, p.intelligence_bonus, p.luck_bonus, p.special_ability 
                FROM rpg_character_pets cp 
                JOIN rpg_pets p ON cp.pet_id = p.id 
                WHERE cp.id = ? AND cp.character_id = ?`,
                [petId, character.id]
            ) as unknown as any[]);

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.pet_not_found });
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
                    { name: `🎖️ ${texts.info.rarity}`, value: p.rarity.charAt(0).toUpperCase() + p.rarity.slice(1), inline: true },
                    { name: `📊 ${texts.info.level}`, value: p.level.toString(), inline: true },
                    { name: `❤️ ${texts.info.happiness}`, value: `${happinessBar} ${p.happiness}/100`, inline: true },
                    { name: `⭐ ${texts.info.experience}`, value: `${p.experience}/${expNeeded}\n${expBar}`, inline: false },
                    { name: `💪 ${texts.info.stat_bonuses}`, value: 
                        `STR: +${p.strength_bonus} | DEF: +${p.defense_bonus} | AGI: +${p.agility_bonus}\n` +
                        `INT: +${p.intelligence_bonus} | LUK: +${p.luck_bonus}`, 
                        inline: false 
                    }
                )
                .setFooter({ text: p.is_active ? texts.info.currently_equipped : texts.info.not_equipped })
                .setTimestamp();

            if (p.special_ability) {
                embed.addFields({ name: `✨ ${texts.info.special_ability}`, value: p.special_ability, inline: false });
            }

            if (p.last_fed) {
                embed.addFields({ 
                    name: `🍖 ${texts.info.last_fed}`, 
                    value: `<t:${Math.floor(p.last_fed / 1000)}:R>`, 
                    inline: true 
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "rename") {
            const petId = interaction.options.getInteger("pet_id", true);
            const newName = interaction.options.getString("name", true).trim();

            if (!/^[a-zA-Z0-9 ]+$/.test(newName)) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.rename.invalid_name });
            }

            const pet = (await db.query(
                `SELECT cp.*, p.emoji FROM rpg_character_pets cp JOIN rpg_pets p ON cp.pet_id = p.id WHERE cp.id = ? AND cp.character_id = ?`,
                [petId, character.id]
            ) as unknown as any[]);

            if (!pet[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.pet_not_found });
            }

            const oldName = pet[0].name;
            await db.query("UPDATE rpg_character_pets SET name = ? WHERE id = ?", [newName, petId]);

            const embed = new EmbedBuilder()
                .setColor("#FF69B4")
                .setTitle(pet[0].emoji + " " + texts.rename.renamed + newName + "!")
                .addFields(
                    { name: texts.rename.old_name, value: oldName, inline: true },
                    { name: texts.rename.new_name, value: newName, inline: true }
                )
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
