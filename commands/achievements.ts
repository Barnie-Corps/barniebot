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
        .setName("achievements")
        .setDescription("View and track your achievements")
        .addSubcommand(s => s.setName("list")
            .setDescription("View all achievements")
            .addStringOption(o => o.setName("category")
                .setDescription("Filter by category")
                .addChoices(
                    { name: "Combat", value: "combat" },
                    { name: "Exploration", value: "exploration" },
                    { name: "Collection", value: "collection" },
                    { name: "Social", value: "social" },
                    { name: "Crafting", value: "crafting" }
                )))
        .addSubcommand(s => s.setName("progress")
            .setDescription("View your achievement progress")),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const session = await getSession(interaction.user.id);
        if (!session) {
            return interaction.editReply({ content: "❌ You need to log in first! Use `/login` to access your account." });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return interaction.editReply({ content: "❌ You need to create a character first! Use `/rpg create` to begin your adventure." });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "list") {
            const category = interaction.options.getString("category");
            
            let query = "SELECT * FROM rpg_achievements WHERE hidden = FALSE";
            const params: any[] = [];
            
            if (category) {
                query += " AND category = ?";
                params.push(category);
            }
            
            query += " ORDER BY category, id";
            
            const achievements: any = await db.query(query, params);
            
            if (achievements.length === 0) {
                return interaction.editReply({ content: "📜 No achievements found for this category." });
            }

            const charAchievements: any = await db.query(
                "SELECT achievement_id, progress, unlocked FROM rpg_character_achievements WHERE character_id = ?",
                [character.id]
            );
            
            const achievementMap = new Map();
            for (const ca of charAchievements) {
                achievementMap.set(ca.achievement_id, { progress: ca.progress, unlocked: ca.unlocked });
            }

            const embed = new EmbedBuilder()
                .setColor("#FFD700")
                .setTitle(`🏆 Achievements${category ? ` - ${category.charAt(0).toUpperCase() + category.slice(1)}` : ""}`)
                .setDescription(`**${character.name}**'s achievement collection`)
                .setTimestamp();

            let currentCategory = "";
            for (const ach of achievements) {
                if (ach.category !== currentCategory) {
                    currentCategory = ach.category;
                }
                
                const progress = achievementMap.get(ach.id);
                const isUnlocked = progress?.unlocked || false;
                const currentProgress = progress?.progress || 0;
                const progressBar = Math.floor((currentProgress / ach.requirement_value) * 10);
                const bar = "▰".repeat(progressBar) + "▱".repeat(10 - progressBar);
                
                const status = isUnlocked ? "✅" : "🔒";
                const rewardText = [];
                if (ach.reward_gold > 0) rewardText.push(`💰 ${ach.reward_gold}`);
                if (ach.reward_experience > 0) rewardText.push(`⭐ ${ach.reward_experience} XP`);
                
                embed.addFields({
                    name: `${status} ${ach.icon} ${ach.name}`,
                    value: `*${ach.description}*\nProgress: ${currentProgress}/${ach.requirement_value} ${bar}\n${rewardText.length > 0 ? `Rewards: ${rewardText.join(" | ")}` : ""}`,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed], content: "" });
        }

        if (sub === "progress") {
            const charAchievements: any = await db.query(
                `SELECT ca.*, a.name, a.description, a.icon, a.category, a.requirement_value, a.reward_gold, a.reward_experience 
                FROM rpg_character_achievements ca 
                JOIN rpg_achievements a ON ca.achievement_id = a.id 
                WHERE ca.character_id = ? AND ca.unlocked = FALSE AND ca.progress > 0 
                ORDER BY (ca.progress / a.requirement_value) DESC 
                LIMIT 10`,
                [character.id]
            );

            if (charAchievements.length === 0) {
                return interaction.editReply({ content: "📊 You don't have any achievements in progress. Start exploring to unlock some!" });
            }

            const embed = new EmbedBuilder()
                .setColor("#3498DB")
                .setTitle("📊 Achievement Progress")
                .setDescription(`**${character.name}**'s current achievements`)
                .setTimestamp();

            for (const ach of charAchievements) {
                const progressBar = Math.floor((ach.progress / ach.requirement_value) * 20);
                const bar = "▰".repeat(progressBar) + "▱".repeat(20 - progressBar);
                const percentage = Math.floor((ach.progress / ach.requirement_value) * 100);
                
                embed.addFields({
                    name: `${ach.icon} ${ach.name}`,
                    value: `${bar} ${percentage}%\n${ach.progress}/${ach.requirement_value} - *${ach.description}*`,
                    inline: false
                });
            }

            const totalUnlocked: any = await db.query(
                "SELECT COUNT(*) as count FROM rpg_character_achievements WHERE character_id = ? AND unlocked = TRUE",
                [character.id]
            );
            const totalAchievements: any = await db.query("SELECT COUNT(*) as count FROM rpg_achievements WHERE hidden = FALSE");
            
            embed.setFooter({ text: `Unlocked: ${totalUnlocked[0]?.count || 0}/${totalAchievements[0]?.count || 0}` });

            return interaction.editReply({ embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
