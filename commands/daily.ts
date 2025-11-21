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
        let texts = {
            errors: {
                not_logged_in: "You need to log in first! Use ",
                no_character: "You need to create a character first! Use ",
                already_claimed: "You've already claimed your daily reward! Come back in ",
                come_back: ".",
                hours: "h",
                minutes: "m"
            },
            daily_reward: {
                title: "Daily Reward Claimed!",
                collected: " collected their daily rewards!",
                gold: "Gold",
                experience: "Experience",
                streak: "Streak",
                day: "day",
                days: "days",
                streak_bonus: "Streak Bonus",
                multiplier: " multiplier",
                total_claims: "Total claims: ",
                claim_again: " | Claim again in 24 hours!",
                bonus_gold: "Bonus: ",
                bonus_gold_item: " Gold + Random Item!",
                bonus_rare: " Gold + Rare Item!",
                streak_lost: "Streak Lost",
                streak_lost_desc: "Your ",
                streak_lost_desc2: " day streak was lost! Claim daily to maintain your streak."
            },
            first_daily: {
                title: "First Daily Reward!",
                welcome: "Welcome to the daily reward system, ",
                tip: "Tip",
                tip_desc: "Claim your rewards every day to build a streak and earn bigger bonuses!",
                come_back_tomorrow: "Come back tomorrow for your next reward!"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const session = await getSession(interaction.user.id);
        if (!session) {
            return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.not_logged_in + "`/login`" + texts.errors.come_back });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.no_character + "`/rpg create`" + texts.errors.come_back });
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
                    content: "⏰ " + texts.errors.already_claimed + hoursLeft + texts.errors.hours + " " + minutesLeft + texts.errors.minutes + texts.errors.come_back
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
                { day: 7, bonus: "🎁 " + texts.daily_reward.bonus_gold + "500" + texts.daily_reward.bonus_gold.slice(6) },
                { day: 14, bonus: "🎁 " + texts.daily_reward.bonus_gold + "1000" + texts.daily_reward.bonus_gold_item },
                { day: 30, bonus: "🎁 " + texts.daily_reward.bonus_gold + "5000" + texts.daily_reward.bonus_rare }
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
                .setTitle("🎁 " + texts.daily_reward.title)
                .setDescription(character.name + texts.daily_reward.collected)
                .addFields(
                    { name: "💰 " + texts.daily_reward.gold, value: `+${gold}`, inline: true },
                    { name: "⭐ " + texts.daily_reward.experience, value: `+${exp}`, inline: true },
                    { name: "🔥 " + texts.daily_reward.streak, value: `${newStreak} ${newStreak > 1 ? texts.daily_reward.days : texts.daily_reward.day}`, inline: true },
                    { name: "📊 " + texts.daily_reward.streak_bonus, value: "x" + streakMultiplier.toFixed(1) + texts.daily_reward.multiplier, inline: false }
                )
                .setFooter({ text: texts.daily_reward.total_claims + (dailyData[0].total_claims + 1) + texts.daily_reward.claim_again })
                .setTimestamp();

            if (bonusText) {
                embed.setDescription(embed.data.description + bonusText);
            }

            if (!isStreakValid && dailyData[0].streak > 0) {
                embed.addFields({ 
                    name: "⚠️ " + texts.daily_reward.streak_lost, 
                    value: texts.daily_reward.streak_lost_desc + dailyData[0].streak + texts.daily_reward.streak_lost_desc2, 
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
                .setTitle("🎁 " + texts.first_daily.title)
                .setDescription(texts.first_daily.welcome + character.name + "!")
                .addFields(
                    { name: "💰 " + texts.daily_reward.gold, value: `+${gold}`, inline: true },
                    { name: "⭐ " + texts.daily_reward.experience, value: `+${exp}`, inline: true },
                    { name: "🔥 " + texts.daily_reward.streak, value: "1 " + texts.daily_reward.day, inline: true },
                    { name: "💡 " + texts.first_daily.tip, value: texts.first_daily.tip_desc, inline: false }
                )
                .setFooter({ text: texts.first_daily.come_back_tomorrow })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
