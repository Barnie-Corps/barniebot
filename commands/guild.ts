import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import { RPGSession, RPGCharacter, RPGGuild, RPGGuildMember } from "../types/interfaces";
import type { GuildCountRow, GuildInsertResult, GuildMemberRow, GuildWithCounts } from "../types/guildCommand";

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
        .setName("guild")
        .setDescription("Manage your RPG guild")
        .addSubcommand(s => s.setName("create")
            .setDescription("Create a new guild")
            .addStringOption(o => o.setName("name")
                .setDescription("Guild name")
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(50))
            .addStringOption(o => o.setName("description")
                .setDescription("Guild description")
                .setMaxLength(200))
            .addStringOption(o => o.setName("emblem")
                .setDescription("Guild emblem emoji")
                .setMaxLength(2)))
        .addSubcommand(s => s.setName("info")
            .setDescription("View guild information")
            .addStringOption(o => o.setName("name")
                .setDescription("Guild name to view (leave empty for your guild)")))
        .addSubcommand(s => s.setName("invite")
            .setDescription("Invite a player to your guild")
            .addStringOption(o => o.setName("character")
                .setDescription("Character name to invite")
                .setRequired(true)))
        .addSubcommand(s => s.setName("join")
            .setDescription("Join a guild")
            .addStringOption(o => o.setName("name")
                .setDescription("Guild name")
                .setRequired(true)))
        .addSubcommand(s => s.setName("leave")
            .setDescription("Leave your current guild"))
        .addSubcommand(s => s.setName("donate")
            .setDescription("Donate gold to your guild")
            .addIntegerOption(o => o.setName("amount")
                .setDescription("Amount of gold to donate")
                .setRequired(true)
                .setMinValue(1)))
        .addSubcommand(s => s.setName("members")
            .setDescription("View guild members"))
        .addSubcommand(s => s.setName("list")
            .setDescription("List all guilds")),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const session = await getSession(interaction.user.id);
        if (!session) {
            let text = "❌ You need to log in first! Use `/login` to access your account.";
            if (lang !== "en") text = (await utils.translate(text, "en", lang).catch(() => ({ text }))).text;
            return utils.safeInteractionRespond(interaction, { content: text });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            let text = "❌ You need to create a character first! Use `/rpg create` to begin your adventure.";
            if (lang !== "en") text = (await utils.translate(text, "en", lang).catch(() => ({ text }))).text;
            return utils.safeInteractionRespond(interaction, { content: text });
        }

        const sub = interaction.options.getSubcommand();

        let texts = {
            alreadyInGuild: "❌ You're already in a guild! Leave your current guild first.",
            defaultDescription: "A new guild",
            needGoldToCreate: "❌ You need 5000 gold to create a guild!",
            nameTaken: "❌ A guild with this name already exists!",
            guildCreatedTitle: "{emblem} Guild Created!",
            guildCreatedDesc: "**{name}** has been established!",
            founderField: "Founder",
            levelField: "Level",
            membersField: "Members",
            descriptionField: "Description",
            footerInvite: "Invite members with /guild invite",
            guildNotFoundLong: "❌ Guild not found or you're not in a guild!",
            noDescription: "No description.",
            founderName: "👑 Founder",
            levelName: "📊 Level",
            membersName: "👥 Members",
            guildGoldName: "💰 Guild Gold",
            experienceName: "⭐ Experience",
            foundedName: "📅 Founded",
            guildNotFound: "❌ Guild not found!",
            guildFull: "❌ This guild is full!",
            joinedGuild: "✅ You've joined **{emblem} {name}**! Welcome aboard!",
            notInGuild: "❌ You're not in a guild!",
            leaderCannotLeave: "❌ Guild leaders cannot leave! Transfer leadership or disband the guild first.",
            leftGuild: "✅ You've left **{name}**.",
            notEnoughGold: "❌ You don't have enough gold!",
            donated: "✅ You donated **{amount} gold** to **{emblem} {name}**!\n+{amount} contribution points",
            membersTitle: "{emblem} {name} - Members",
            membersTotal: "Total: {count}/{capacity}",
            memberValue: "Level {level} {cls} | Contribution: {points}",
            noGuilds: "📜 No guilds have been created yet! Be the first with `/guild create`",
            guildListTitle: "🏰 Guild List",
            guildListDesc: "Top guilds in the realm",
            guildListItem: "*{desc}*\n👥 {count}/{capacity} | 💰 {gold}"
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang).catch(() => texts);
        }

        if (sub === "create") {
            const membershipCheck = (await db.query(
                "SELECT * FROM rpg_guild_members WHERE character_id = ?",
                [character.id]
            ) as unknown as RPGGuildMember[]);
            
            if (membershipCheck[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.alreadyInGuild });
            }

            const name = interaction.options.getString("name", true);
            const description = interaction.options.getString("description") || texts.defaultDescription;
            const emblem = interaction.options.getString("emblem") || "🛡️";

            if (character.gold < 5000) {
                return utils.safeInteractionRespond(interaction, { content: texts.needGoldToCreate });
            }

            const existingGuild = (await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [name]) as unknown as RPGGuild[]);
            if (existingGuild[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.nameTaken });
            }

            const result = (await db.query("INSERT INTO rpg_guilds SET ?", [{
                name: name,
                description: description,
                founder_id: character.id,
                level: 1,
                experience: 0,
                gold: 0,
                member_capacity: 20,
                created_at: Date.now(),
                emblem_icon: emblem
            }]) as unknown as GuildInsertResult);

            await db.query("INSERT INTO rpg_guild_members SET ?", [{
                character_id: character.id,
                guild_id: result.insertId,
                role: "leader",
                joined_at: Date.now(),
                contribution_points: 0
            }]);

            await db.query("UPDATE rpg_characters SET gold = gold - 5000 WHERE id = ?", [character.id]);

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(texts.guildCreatedTitle.replace("{emblem}", emblem))
                .setDescription(texts.guildCreatedDesc.replace("{name}", name))
                .addFields(
                    { name: texts.founderField, value: character.name, inline: true },
                    { name: texts.levelField, value: "1", inline: true },
                    { name: texts.membersField, value: "1/20", inline: true },
                    { name: texts.descriptionField, value: description, inline: false }
                )
                .setFooter({ text: texts.footerInvite })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "info") {
            const guildName = interaction.options.getString("name");
            let guild: RPGGuild | null = null;

            if (guildName) {
                const guildResult = (await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [guildName]) as unknown as RPGGuild[]);
                guild = guildResult[0] || null;
            } else {
                const membership = (await db.query(
                    "SELECT g.* FROM rpg_guilds g JOIN rpg_guild_members gm ON g.id = gm.guild_id WHERE gm.character_id = ?",
                    [character.id]
                ) as unknown as GuildWithCounts[]);
                guild = membership[0] || null;
            }

            if (!guild) {
                return utils.safeInteractionRespond(interaction, { content: texts.guildNotFoundLong });
            }

            const members = (await db.query(
                "SELECT COUNT(*) as count FROM rpg_guild_members WHERE guild_id = ?",
                [guild.id]
            ) as unknown as GuildCountRow[]);

            const founder = (await db.query("SELECT name FROM rpg_characters WHERE id = ?", [guild.founder_id]) as unknown as { name: string }[]);

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(`${guild.emblem_icon} ${guild.name}`)
                .setDescription(guild.description ?? texts.noDescription)
                .addFields(
                    { name: texts.founderName, value: founder[0]?.name || "Unknown", inline: true },
                    { name: texts.levelName, value: guild.level.toString(), inline: true },
                    { name: texts.membersName, value: `${members[0]?.count ?? 0}/${guild.member_capacity ?? 0}`, inline: true },
                    { name: texts.guildGoldName, value: guild.gold.toLocaleString(), inline: true },
                    { name: texts.experienceName, value: (guild.exp ?? guild.experience ?? 0).toLocaleString(), inline: true },
                    { name: texts.foundedName, value: `<t:${Math.floor(guild.created_at / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "join") {
            const membershipCheck = (await db.query(
                "SELECT * FROM rpg_guild_members WHERE character_id = ?",
                [character.id]
            ) as unknown as RPGGuildMember[]);
            
            if (membershipCheck[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.alreadyInGuild });
            }

            const guildName = interaction.options.getString("name", true);
            const guild = (await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [guildName]) as unknown as RPGGuild[]);

            if (!guild[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.guildNotFound });
            }

            const memberCount = (await db.query(
                "SELECT COUNT(*) as count FROM rpg_guild_members WHERE guild_id = ?",
                [guild[0].id]
            ) as unknown as GuildCountRow[]);

            if ((memberCount[0]?.count ?? 0) >= (guild[0].member_capacity ?? 0)) {
                return utils.safeInteractionRespond(interaction, { content: texts.guildFull });
            }

            await db.query("INSERT INTO rpg_guild_members SET ?", [{
                character_id: character.id,
                guild_id: guild[0].id,
                role: "member",
                joined_at: Date.now(),
                contribution_points: 0
            }]);

            return utils.safeInteractionRespond(interaction, { content: texts.joinedGuild.replace("{emblem}", guild[0].emblem_icon ?? "").replace("{name}", guild[0].name) });
        }

        if (sub === "leave") {
            const membership = (await db.query(
                "SELECT gm.*, g.name FROM rpg_guild_members gm JOIN rpg_guilds g ON gm.guild_id = g.id WHERE gm.character_id = ?",
                [character.id]
            ) as unknown as (RPGGuildMember & { name: string })[]);
            
            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.notInGuild });
            }

            if (membership[0].role === "leader") {
                return utils.safeInteractionRespond(interaction, { content: texts.leaderCannotLeave });
            }

            await db.query("DELETE FROM rpg_guild_members WHERE character_id = ?", [character.id]);
            
            return utils.safeInteractionRespond(interaction, { content: texts.leftGuild.replace("{name}", membership[0].name) });
        }

        if (sub === "donate") {
            const amount = interaction.options.getInteger("amount", true);

            if (character.gold < amount) {
                return utils.safeInteractionRespond(interaction, { content: texts.notEnoughGold });
            }

            const membership = (await db.query(
                "SELECT gm.*, g.name, g.emblem_icon FROM rpg_guild_members gm JOIN rpg_guilds g ON gm.guild_id = g.id WHERE gm.character_id = ?",
                [character.id]
            ) as unknown as (RPGGuildMember & { name: string; emblem_icon: string })[]);

            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.notInGuild });
            }
            await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [amount, character.id]);
            await db.query("UPDATE rpg_guilds SET gold = gold + ? WHERE id = ?", [amount, membership[0].guild_id]);
            await db.query(
                "UPDATE rpg_guild_members SET contribution_points = contribution_points + ? WHERE character_id = ? AND guild_id = ?",
                [amount, character.id, membership[0].guild_id]
            );

            return utils.safeInteractionRespond(interaction, {
                content: texts.donated.replace("{amount}", String(amount)).replace("{emblem}", membership[0].emblem_icon).replace("{name}", membership[0].name)
            });
        }

        if (sub === "members") {
            const membership = (await db.query(
                "SELECT g.* FROM rpg_guilds g JOIN rpg_guild_members gm ON g.id = gm.guild_id WHERE gm.character_id = ?",
                [character.id]
            ) as unknown as RPGGuild[]);
            
            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: texts.notInGuild });
            }

            const members = (await db.query(
                `SELECT c.name, c.level, c.class, gm.role, gm.contribution_points, gm.joined_at 
                FROM rpg_guild_members gm 
                JOIN rpg_characters c ON gm.character_id = c.id 
                WHERE gm.guild_id = ? 
                ORDER BY gm.role = 'leader' DESC, gm.contribution_points DESC`,
                [membership[0].id]
            ) as unknown as GuildMemberRow[]);

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(texts.membersTitle.replace("{emblem}", membership[0].emblem_icon ?? "").replace("{name}", membership[0].name))
                .setDescription(texts.membersTotal.replace("{count}", String(members.length)).replace("{capacity}", String(membership[0].member_capacity)))
                .setTimestamp();

            for (const member of members.slice(0, 25)) {
                const roleIcon = member.role === "leader" ? "👑" : member.role === "officer" ? "⭐" : "👤";
                embed.addFields({
                    name: `${roleIcon} ${member.name}`,
                    value: texts.memberValue.replace("{level}", String(member.level)).replace("{cls}", member.class).replace("{points}", String(member.contribution_points)),
                    inline: true
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "list") {
            const guilds = (await db.query(
                "SELECT g.*, COUNT(gm.character_id) as member_count FROM rpg_guilds g LEFT JOIN rpg_guild_members gm ON g.id = gm.guild_id GROUP BY g.id ORDER BY g.level DESC, g.experience DESC LIMIT 10"
            ) as unknown as GuildWithCounts[]);

            if (guilds.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: texts.noGuilds });
            }

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(texts.guildListTitle)
                .setDescription(texts.guildListDesc)
                .setTimestamp();

            for (const guild of guilds) {
                embed.addFields({
                    name: `${guild.emblem_icon} ${guild.name} [Lvl ${guild.level}]`,
                    value: texts.guildListItem
                        .replace("{desc}", guild.description ?? "")
                        .replace("{count}", String(guild.member_count ?? 0))
                        .replace("{capacity}", String(guild.member_capacity ?? 0))
                        .replace("{gold}", guild.gold.toLocaleString()),
                    inline: false
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
