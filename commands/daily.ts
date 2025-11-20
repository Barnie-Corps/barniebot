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
        .setName("daily")
        .setDescription("Claim your daily rewards and maintain your streak!"),
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

        const dailyData: any = await db.query("SELECT * FROM rpg_daily_rewards WHERE character_id = ?", [character.id]);
        const now = Date.now();
        const oneDay = 86400000;
        
        if (dailyData[0]) {
            const timeSinceLastClaim = now - dailyData[0].last_claim;
            
            if (timeSinceLastClaim < oneDay) {
                const timeLeft = oneDay - timeSinceLastClaim;
                const hoursLeft = Math.floor(timeLeft / 3600000);
                const minutesLeft = Math.floor((timeLeft % 3600000) / 60000);
                
                return utils.safeInteractionRespond(interaction, { 
                    content: `⏰ You've already claimed your daily reward! Come back in **${hoursLeft}h ${minutesLeft}m**.` 
                });
            }
            
            const isStreakValid = timeSinceLastClaim < (oneDay * 2);
            const newStreak = isStreakValid ? dailyData[0].streak + 1 : 1;
            
            const baseGold = 100;
            const baseExp = 50;
            const streakMultiplier = 1 + (newStreak * 0.1);
            const gold = Math.floor(baseGold * streakMultiplier);
            const exp = Math.floor(baseExp * streakMultiplier);
            
            await db.query(
                "UPDATE rpg_daily_rewards SET last_claim = ?, streak = ?, total_claims = total_claims + 1 WHERE character_id = ?",
                [now, newStreak, character.id]
            );
            
            await db.query(
                "UPDATE rpg_characters SET gold = gold + ?, experience = experience + ? WHERE id = ?",
                [gold, exp, character.id]
            );

            const streakBonuses = [
                { day: 7, bonus: "🎁 Bonus: 500 Gold!" },
                { day: 14, bonus: "🎁 Bonus: 1000 Gold + Random Item!" },
                { day: 30, bonus: "🎁 Bonus: 5000 Gold + Rare Item!" }
            ];
            
            let bonusText = "";
            for (const sb of streakBonuses) {
                if (newStreak === sb.day) {
                    bonusText = `\n\n${sb.bonus}`;
                    if (sb.day === 7) await db.query("UPDATE rpg_characters SET gold = gold + 500 WHERE id = ?", [character.id]);
                    if (sb.day === 14) await db.query("UPDATE rpg_characters SET gold = gold + 1000 WHERE id = ?", [character.id]);
                    if (sb.day === 30) await db.query("UPDATE rpg_characters SET gold = gold + 5000 WHERE id = ?", [character.id]);
                    break;
                }
            }

            const embed = new EmbedBuilder()
                .setColor("#00FF00")
                .setTitle("🎁 Daily Reward Claimed!")
                .setDescription(`**${character.name}** collected their daily rewards!`)
                .addFields(
                    { name: "💰 Gold", value: `+${gold}`, inline: true },
                    { name: "⭐ Experience", value: `+${exp}`, inline: true },
                    { name: "🔥 Streak", value: `${newStreak} day${newStreak > 1 ? "s" : ""}`, inline: true },
                    { name: "📊 Streak Bonus", value: `x${streakMultiplier.toFixed(1)} multiplier`, inline: false }
                )
                .setFooter({ text: `Total claims: ${dailyData[0].total_claims + 1} | Claim again in 24 hours!` })
                .setTimestamp();

            if (bonusText) {
                embed.setDescription(embed.data.description + bonusText);
            }

            if (!isStreakValid && dailyData[0].streak > 0) {
                embed.addFields({ 
                    name: "⚠️ Streak Lost", 
                    value: `Your ${dailyData[0].streak} day streak was lost! Claim daily to maintain your streak.`, 
                    inline: false 
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            
        } else {
            await db.query("INSERT INTO rpg_daily_rewards SET ?", [{
                character_id: character.id,
                last_claim: now,
                streak: 1,
                total_claims: 1
            }]);
            
            const gold = 100;
            const exp = 50;
            
            await db.query(
                "UPDATE rpg_characters SET gold = gold + ?, experience = experience + ? WHERE id = ?",
                [gold, exp, character.id]
            );

            const embed = new EmbedBuilder()
                .setColor("#00FF00")
                .setTitle("🎁 First Daily Reward!")
                .setDescription(`Welcome to the daily reward system, **${character.name}**!`)
                .addFields(
                    { name: "💰 Gold", value: `+${gold}`, inline: true },
                    { name: "⭐ Experience", value: `+${exp}`, inline: true },
                    { name: "🔥 Streak", value: "1 day", inline: true },
                    { name: "💡 Tip", value: "Claim your rewards every day to build a streak and earn bigger bonuses!", inline: false }
                )
                .setFooter({ text: "Come back tomorrow for your next reward!" })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
