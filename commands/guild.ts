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
            return utils.safeInteractionRespond(interaction, { content: "❌ You need to log in first! Use `/login` to access your account." });
        }

        const character = await getCharacter(session.account_id);
        if (!character) {
            return utils.safeInteractionRespond(interaction, { content: "❌ You need to create a character first! Use `/rpg create` to begin your adventure." });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            const membershipCheck: any = await db.query(
                "SELECT * FROM rpg_guild_members WHERE character_id = ?",
                [character.id]
            );
            
            if (membershipCheck[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You're already in a guild! Leave your current guild first." });
            }

            const name = interaction.options.getString("name", true);
            const description = interaction.options.getString("description") || "A new guild";
            const emblem = interaction.options.getString("emblem") || "🛡️";

            if (character.gold < 5000) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You need 5000 gold to create a guild!" });
            }

            const existingGuild: any = await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [name]);
            if (existingGuild[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ A guild with this name already exists!" });
            }

            const result: any = await db.query("INSERT INTO rpg_guilds SET ?", [{
                name: name,
                description: description,
                founder_id: character.id,
                level: 1,
                experience: 0,
                gold: 0,
                member_capacity: 20,
                created_at: Date.now(),
                emblem_icon: emblem
            }]);

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
                .setTitle(`${emblem} Guild Created!`)
                .setDescription(`**${name}** has been established!`)
                .addFields(
                    { name: "Founder", value: character.name, inline: true },
                    { name: "Level", value: "1", inline: true },
                    { name: "Members", value: "1/20", inline: true },
                    { name: "Description", value: description, inline: false }
                )
                .setFooter({ text: "Invite members with /guild invite" })
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "info") {
            const guildName = interaction.options.getString("name");
            let guild: any;

            if (guildName) {
                guild = await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [guildName]);
                guild = guild[0];
            } else {
                const membership: any = await db.query(
                    "SELECT g.* FROM rpg_guilds g JOIN rpg_guild_members gm ON g.id = gm.guild_id WHERE gm.character_id = ?",
                    [character.id]
                );
                guild = membership[0];
            }

            if (!guild) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Guild not found or you're not in a guild!" });
            }

            const members: any = await db.query(
                "SELECT COUNT(*) as count FROM rpg_guild_members WHERE guild_id = ?",
                [guild.id]
            );

            const founder: any = await db.query("SELECT name FROM rpg_characters WHERE id = ?", [guild.founder_id]);

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(`${guild.emblem_icon} ${guild.name}`)
                .setDescription(guild.description)
                .addFields(
                    { name: "👑 Founder", value: founder[0]?.name || "Unknown", inline: true },
                    { name: "📊 Level", value: guild.level.toString(), inline: true },
                    { name: "👥 Members", value: `${members[0].count}/${guild.member_capacity}`, inline: true },
                    { name: "💰 Guild Gold", value: guild.gold.toLocaleString(), inline: true },
                    { name: "⭐ Experience", value: guild.experience.toLocaleString(), inline: true },
                    { name: "📅 Founded", value: `<t:${Math.floor(guild.created_at / 1000)}:R>`, inline: true }
                )
                .setTimestamp();

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "join") {
            const membershipCheck: any = await db.query(
                "SELECT * FROM rpg_guild_members WHERE character_id = ?",
                [character.id]
            );
            
            if (membershipCheck[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You're already in a guild! Leave your current guild first." });
            }

            const guildName = interaction.options.getString("name", true);
            const guild: any = await db.query("SELECT * FROM rpg_guilds WHERE name = ?", [guildName]);
            
            if (!guild[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ Guild not found!" });
            }

            const memberCount: any = await db.query(
                "SELECT COUNT(*) as count FROM rpg_guild_members WHERE guild_id = ?",
                [guild[0].id]
            );

            if (memberCount[0].count >= guild[0].member_capacity) {
                return utils.safeInteractionRespond(interaction, { content: "❌ This guild is full!" });
            }

            await db.query("INSERT INTO rpg_guild_members SET ?", [{
                character_id: character.id,
                guild_id: guild[0].id,
                role: "member",
                joined_at: Date.now(),
                contribution_points: 0
            }]);

            return utils.safeInteractionRespond(interaction, { content: `✅ You've joined **${guild[0].emblem_icon} ${guild[0].name}**! Welcome aboard!` });
        }

        if (sub === "leave") {
            const membership: any = await db.query(
                "SELECT gm.*, g.name FROM rpg_guild_members gm JOIN rpg_guilds g ON gm.guild_id = g.id WHERE gm.character_id = ?",
                [character.id]
            );
            
            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You're not in a guild!" });
            }

            if (membership[0].role === "leader") {
                return utils.safeInteractionRespond(interaction, { content: "❌ Guild leaders cannot leave! Transfer leadership or disband the guild first." });
            }

            await db.query("DELETE FROM rpg_guild_members WHERE character_id = ?", [character.id]);
            
            return utils.safeInteractionRespond(interaction, { content: `✅ You've left **${membership[0].name}**.` });
        }

        if (sub === "donate") {
            const amount = interaction.options.getInteger("amount", true);

            if (character.gold < amount) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You don't have enough gold!" });
            }

            const membership: any = await db.query(
                "SELECT gm.*, g.name, g.emblem_icon FROM rpg_guild_members gm JOIN rpg_guilds g ON gm.guild_id = g.id WHERE gm.character_id = ?",
                [character.id]
            );

            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You're not in a guild!" });
            }            await db.query("UPDATE rpg_characters SET gold = gold - ? WHERE id = ?", [amount, character.id]);
            await db.query("UPDATE rpg_guilds SET gold = gold + ? WHERE id = ?", [amount, membership[0].guild_id]);
            await db.query(
                "UPDATE rpg_guild_members SET contribution_points = contribution_points + ? WHERE character_id = ? AND guild_id = ?",
                [amount, character.id, membership[0].guild_id]
            );

            return utils.safeInteractionRespond(interaction, { 
                content: `✅ You donated **${amount} gold** to **${membership[0].emblem_icon} ${membership[0].name}**!\n+${amount} contribution points` 
            });
        }

        if (sub === "members") {
            const membership: any = await db.query(
                "SELECT g.* FROM rpg_guilds g JOIN rpg_guild_members gm ON g.id = gm.guild_id WHERE gm.character_id = ?",
                [character.id]
            );
            
            if (!membership[0]) {
                return utils.safeInteractionRespond(interaction, { content: "❌ You're not in a guild!" });
            }

            const members: any = await db.query(
                `SELECT c.name, c.level, c.class, gm.role, gm.contribution_points, gm.joined_at 
                FROM rpg_guild_members gm 
                JOIN rpg_characters c ON gm.character_id = c.id 
                WHERE gm.guild_id = ? 
                ORDER BY gm.role = 'leader' DESC, gm.contribution_points DESC`,
                [membership[0].id]
            );

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle(`${membership[0].emblem_icon} ${membership[0].name} - Members`)
                .setDescription(`Total: ${members.length}/${membership[0].member_capacity}`)
                .setTimestamp();

            for (const member of members.slice(0, 25)) {
                const roleIcon = member.role === "leader" ? "👑" : member.role === "officer" ? "⭐" : "👤";
                embed.addFields({
                    name: `${roleIcon} ${member.name}`,
                    value: `Level ${member.level} ${member.class} | Contribution: ${member.contribution_points}`,
                    inline: true
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }

        if (sub === "list") {
            const guilds: any = await db.query(
                "SELECT g.*, COUNT(gm.character_id) as member_count FROM rpg_guilds g LEFT JOIN rpg_guild_members gm ON g.id = gm.guild_id GROUP BY g.id ORDER BY g.level DESC, g.experience DESC LIMIT 10"
            );

            if (guilds.length === 0) {
                return utils.safeInteractionRespond(interaction, { content: "📜 No guilds have been created yet! Be the first with `/guild create`" });
            }

            const embed = new EmbedBuilder()
                .setColor("#9B59B6")
                .setTitle("🏰 Guild List")
                .setDescription("Top guilds in the realm")
                .setTimestamp();

            for (const guild of guilds) {
                embed.addFields({
                    name: `${guild.emblem_icon} ${guild.name} [Lvl ${guild.level}]`,
                    value: `*${guild.description}*\n👥 ${guild.member_count}/${guild.member_capacity} | 💰 ${guild.gold.toLocaleString()}`,
                    inline: false
                });
            }

            return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
        }
    },
    ephemeral: false
};
