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
        .setName("dungeon")
        .setDescription("Enter dangerous dungeons for great rewards")
        .addSubcommand(s => s.setName("enter")
            .setDescription("Enter a dungeon")
            .addIntegerOption(o => o.setName("id")
                .setDescription("Dungeon ID")
                .setRequired(true)))
        .addSubcommand(s => s.setName("continue")
            .setDescription("Continue your dungeon run"))
        .addSubcommand(s => s.setName("list")
            .setDescription("View available dungeons"))
        .addSubcommand(s => s.setName("status")
            .setDescription("Check your current dungeon progress")),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_logged_in: "You need to log in first! Use ",
                no_character: "You need to create a character first! Use ",
                already_in_dungeon: "You're already in a dungeon! Use ",
                or_abandon: " or abandon it first.",
                dungeon_not_found: "Dungeon not found!",
                need_level: "You need to be level ",
                to_enter: " to enter this dungeon!",
                too_injured: "You're too injured to enter a dungeon! Rest first with ",
                not_in_dungeon: "You're not in a dungeon! Use ",
                to_start: " to start one."
            },
            list: {
                title: "Available Dungeons",
                test_strength: "Test your strength in these challenging dungeons!",
                no_dungeons: "No dungeons available yet. Check back soon!",
                required_level: "Required Level: ",
                difficulty: "Difficulty: ",
                stages: "Stages: ",
                boss: "Boss: ",
                rewards: "Rewards: ",
                gold: " gold",
                xp: " XP",
                use_enter: "Use /dungeon enter <id> to challenge a dungeon!"
            },
            enter: {
                title: "Entering: ",
                steps_into: " steps into the darkness...",
                total_stages: "Total Stages",
                final_boss: "Final Boss",
                warning: "Warning",
                cannot_leave: "You cannot leave until the dungeon is complete or you're defeated!",
                use_continue: "Use /dungeon continue to progress!"
            },
            continue: {
                stage_complete: "Stage ",
                complete: " Complete!",
                defeated: " defeated the ",
                battle_log: "Battle Log",
                rewards: "Rewards",
                hp_remaining: "HP Remaining",
                progress: "Progress",
                stage: "Stage ",
                boss_next: " (Boss Next!)",
                use_advance: "Use /dungeon continue to advance!",
                dungeon_completed: "Dungeon Completed!",
                has_conquered: " has conquered ",
                bonus: "Bonus: ",
                total_rewards: "Total Rewards",
                defeat_title: "Defeat!",
                was_defeated: " was defeated by the ",
                progress_lost: "Progress Lost",
                failed_at: "Failed at Stage ",
                rest_and_try: "Rest up and try again!"
            },
            status: {
                title: "Dungeon Progress",
                progress: "Progress",
                stage: "Stage ",
                status: "Status",
                boss_stage: "Boss Stage!",
                in_progress: "In Progress",
                started: "Started",
                keep_going: "Use /dungeon continue to keep going!",
                not_in: "You're not currently in a dungeon."
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

        if (sub === "list") {
            const dungeons: any = await db.query("SELECT * FROM rpg_dungeons ORDER BY required_level");

            if (dungeons.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "🏰 " + texts.list.no_dungeons });
            }

            const embed = new EmbedBuilder()
                .setColor("#8B0000")
                .setTitle("🏰 " + texts.list.title)
                .setDescription(texts.list.test_strength)
                .setTimestamp();

            for (const dungeon of dungeons) {
                const canEnter = character.level >= dungeon.required_level;
                const status = canEnter ? "✅" : "🔒";
                
                embed.addFields({
                    name: `${status} [${dungeon.id}] ${dungeon.name}`,
                    value: `*${dungeon.description}*\n` +
                           `📊 Required Level: ${dungeon.required_level} | Difficulty: ${dungeon.difficulty}\n` +
                           `🎯 Stages: ${dungeon.stages} | 👑 Boss: ${dungeon.boss_name}\n` +
                           `💰 Rewards: ${dungeon.reward_gold_min}-${dungeon.reward_gold_max} gold | ⭐ ${dungeon.reward_exp_min}-${dungeon.reward_exp_max} XP`,
                    inline: false
                });
            }

            embed.setFooter({ text: "Use /dungeon enter <id> to challenge a dungeon!" });

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "enter") {
            const dungeonId = interaction.options.getInteger("id", true);

            const activeRun: any = await db.query(
                "SELECT * FROM rpg_dungeon_runs WHERE character_id = ? AND status = 'in_progress'",
                [character.id]
            );

            if (activeRun[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.already_in_dungeon + "`/dungeon continue`" + texts.errors.or_abandon });
            }

            const dungeon: any = await db.query("SELECT * FROM rpg_dungeons WHERE id = ?", [dungeonId]);
            
            if (!dungeon[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.dungeon_not_found });
            }

            if (character.level < dungeon[0].required_level) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.need_level + dungeon[0].required_level + texts.errors.to_enter });
            }

            if (character.hp < character.max_hp * 0.5) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.too_injured + "`/rpg rest`." });
            }

            await db.query("INSERT INTO rpg_dungeon_runs SET ?", [{
                character_id: character.id,
                dungeon_id: dungeonId,
                stage: 1,
                status: "in_progress",
                started_at: Date.now(),
                completed_at: null,
                rewards_claimed: false
            }]);

            const embed = new EmbedBuilder()
                .setColor("#8B0000")
                .setTitle("🏰 " + texts.enter.title + dungeon[0].name)
                .setDescription(character.name + texts.enter.steps_into)
                .addFields(
                    { name: "📊 " + texts.list.difficulty, value: dungeon[0].difficulty, inline: true },
                    { name: "🎯 " + texts.enter.total_stages, value: dungeon[0].stages.toString(), inline: true },
                    { name: "👑 " + texts.enter.final_boss, value: dungeon[0].boss_name, inline: true },
                    { name: "⚠️ " + texts.enter.warning, value: texts.enter.cannot_leave, inline: false }
                )
                .setFooter({ text: texts.enter.use_continue })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "continue") {
            const activeRun: any = await db.query(
                "SELECT dr.*, d.* FROM rpg_dungeon_runs dr JOIN rpg_dungeons d ON dr.dungeon_id = d.id WHERE dr.character_id = ? AND dr.status = 'in_progress'",
                [character.id]
            );

            if (!activeRun[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.errors.not_in_dungeon + "`/dungeon enter`" + texts.errors.to_start });
            }

            const run = activeRun[0];
            const isBossStage = run.stage === run.stages;
            
            const enemyHp = isBossStage ? 200 + (run.required_level * 20) : 80 + (run.required_level * 10);
            const enemyAtk = isBossStage ? 20 + (run.required_level * 3) : 10 + (run.required_level * 2);
            const enemyDef = isBossStage ? 15 + (run.required_level * 2) : 5 + run.required_level;
            const enemyName = isBossStage ? run.boss_name : `Stage ${run.stage} Monster`;

            let playerHp = character.hp;
            let monsterHp = enemyHp;
            const battleLog: string[] = [];

            const playerAtk = character.strength + Math.floor(Math.random() * 5);
            const playerDef = character.defense;
            const critChance = character.luck / 100;

            let turns = 0;
            while (playerHp > 0 && monsterHp > 0 && turns < 20) {
                const isCrit = Math.random() < critChance;
                const playerDmg = Math.max(1, playerAtk - enemyDef) * (isCrit ? 1.5 : 1);
                monsterHp -= Math.floor(playerDmg);
                battleLog.push(`⚔️ You deal ${Math.floor(playerDmg)} damage${isCrit ? " (CRIT!)" : ""}!`);

                if (monsterHp <= 0) break;

                const monsterDmg = Math.max(1, enemyAtk - playerDef);
                playerHp -= monsterDmg;
                battleLog.push(`💥 ${enemyName} deals ${monsterDmg} damage!`);
                turns++;
            }

            const victory = playerHp > 0;

            if (victory) {
                const stageExp = Math.floor((run.reward_exp_min + run.reward_exp_max) / (run.stages * 2));
                const stageGold = Math.floor((run.reward_gold_min + run.reward_gold_max) / (run.stages * 2));

                await db.query("UPDATE rpg_characters SET hp = ?, experience = experience + ?, gold = gold + ? WHERE id = ?", 
                    [Math.max(1, playerHp), stageExp, stageGold, character.id]
                );

                if (run.stage >= run.stages) {
                    const finalGold = Math.floor(Math.random() * (run.reward_gold_max - run.reward_gold_min + 1)) + run.reward_gold_min;
                    const finalExp = Math.floor(Math.random() * (run.reward_exp_max - run.reward_exp_min + 1)) + run.reward_exp_min;

                    await db.query(
                        "UPDATE rpg_dungeon_runs SET status = 'completed', stage = ?, completed_at = ? WHERE character_id = ? AND status = 'in_progress'",
                        [run.stage, Date.now(), character.id]
                    );

                    await db.query("UPDATE rpg_characters SET gold = gold + ?, experience = experience + ? WHERE id = ?", 
                        [finalGold, finalExp, character.id]
                    );

                    const materialDrop = Math.random() < 0.3;
                    let materialText = "";
                    if (materialDrop) {
                        const materials: any = await db.query("SELECT * FROM rpg_crafting_materials ORDER BY RAND() LIMIT 1");
                        if (materials[0]) {
                            const qty = Math.floor(Math.random() * 3) + 1;
                            const existing: any = await db.query(
                                "SELECT * FROM rpg_character_materials WHERE character_id = ? AND material_id = ?",
                                [character.id, materials[0].id]
                            );
                            
                            if (existing[0]) {
                                await db.query(
                                    "UPDATE rpg_character_materials SET quantity = quantity + ? WHERE character_id = ? AND material_id = ?",
                                    [qty, character.id, materials[0].id]
                                );
                            } else {
                                await db.query("INSERT INTO rpg_character_materials SET ?", [{
                                    character_id: character.id,
                                    material_id: materials[0].id,
                                    quantity: qty
                                }]);
                            }
                            materialText = `\n🎁 Bonus: ${materials[0].emoji} ${materials[0].name} x${qty}`;
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setColor("#FFD700")
                        .setTitle(`🏆 Dungeon Completed!`)
                        .setDescription(`**${character.name}** has conquered **${run.name}**!${materialText}`)
                        .addFields(
                            { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                            { name: "Total Rewards", value: `💰 ${finalGold + stageGold} Gold\n⭐ ${finalExp + stageExp} Experience`, inline: true },
                            { name: "HP Remaining", value: `❤️ ${Math.max(1, playerHp)}/${character.max_hp}`, inline: true }
                        )
                        .setTimestamp();

                    return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
                } else {
                    await db.query(
                        "UPDATE rpg_dungeon_runs SET stage = stage + 1 WHERE character_id = ? AND status = 'in_progress'",
                        [character.id]
                    );

                    const embed = new EmbedBuilder()
                        .setColor("#2ECC71")
                        .setTitle(`⚔️ Stage ${run.stage} Complete!`)
                        .setDescription(`**${character.name}** defeated the ${enemyName}!`)
                        .addFields(
                            { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                            { name: "Rewards", value: `💰 ${stageGold} Gold\n⭐ ${stageExp} Experience`, inline: true },
                            { name: "HP Remaining", value: `❤️ ${Math.max(1, playerHp)}/${character.max_hp}`, inline: true },
                            { name: "Progress", value: `Stage ${run.stage + 1}/${run.stages}${run.stage + 1 === run.stages ? " (Boss Next!)" : ""}`, inline: false }
                        )
                        .setFooter({ text: "Use /dungeon continue to advance!" })
                        .setTimestamp();

                    return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
                }
            } else {
                await db.query(
                    "UPDATE rpg_dungeon_runs SET status = 'failed', completed_at = ? WHERE character_id = ? AND status = 'in_progress'",
                    [Date.now(), character.id]
                );

                await db.query("UPDATE rpg_characters SET hp = 1 WHERE id = ?", [character.id]);

                const embed = new EmbedBuilder()
                    .setColor("#FF0000")
                    .setTitle("💀 Defeat!")
                    .setDescription(`**${character.name}** was defeated by the ${enemyName}!`)
                    .addFields(
                        { name: "Battle Log", value: battleLog.slice(-5).join("\n"), inline: false },
                        { name: "Progress Lost", value: `Failed at Stage ${run.stage}/${run.stages}`, inline: false }
                    )
                    .setFooter({ text: "Rest up and try again!" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
            }
        }

        if (sub === "status") {
            const activeRun: any = await db.query(
                "SELECT dr.*, d.name, d.stages FROM rpg_dungeon_runs dr JOIN rpg_dungeons d ON dr.dungeon_id = d.id WHERE dr.character_id = ? AND dr.status = 'in_progress'",
                [character.id]
            );

            if (!activeRun[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ " + texts.status.not_in });
            }

            const run = activeRun[0];
            const progressBar = Math.floor((run.stage / run.stages) * 20);
            const bar = "▰".repeat(progressBar) + "▱".repeat(20 - progressBar);

            const embed = new EmbedBuilder()
                .setColor("#8B0000")
                .setTitle("🏰 Dungeon Progress")
                .setDescription(`**${run.name}**`)
                .addFields(
                    { name: "Progress", value: `Stage ${run.stage}/${run.stages}\n${bar}`, inline: false },
                    { name: "Status", value: run.stage === run.stages ? "👑 Boss Stage!" : "⚔️ In Progress", inline: true },
                    { name: "Started", value: `<t:${Math.floor(run.started_at / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: "Use /dungeon continue to keep going!" })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
