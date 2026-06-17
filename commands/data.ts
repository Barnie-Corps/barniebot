import { AttachmentBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

const fetchRows = async (sql: string, params: any[] = []) => {
    return await db.query(sql, params) as unknown as any[];
};

const buildExportPayload = async (userId: string) => {
    const [discordUsers, languages, messageCounts, globalMessages, registeredAccounts, logins, warnings, memories, notificationReads, executedCommands, distinctMetrics] = await Promise.all([
        fetchRows("SELECT * FROM discord_users WHERE id = ?", [userId]),
        fetchRows("SELECT * FROM languages WHERE userid = ?", [userId]),
        fetchRows("SELECT * FROM message_count WHERE uid = ?", [userId]),
        fetchRows("SELECT * FROM global_messages WHERE uid = ?", [userId]),
        fetchRows("SELECT id, uid, username, email, verified, verification_code, verified_at, created_at, last_login, last_user_logged, token, password_reset_token, password_reset_expires_at FROM registered_accounts WHERE uid = ?", [userId]),
        fetchRows("SELECT * FROM logins WHERE uid = ?", [userId]),
        fetchRows("SELECT * FROM global_warnings WHERE userid = ? OR authorid = ?", [userId, userId]),
        fetchRows("SELECT * FROM ai_memories WHERE uid = ?", [userId]),
        fetchRows("SELECT * FROM user_notification_reads WHERE user_id = ?", [userId]),
        fetchRows("SELECT * FROM executed_commands WHERE uid = ?", [userId]),
        fetchRows("SELECT * FROM daily_distinct_metrics WHERE entity_id = ?", [userId])
    ]);

    const accountRows = registeredAccounts as any[];
    const accountIds = accountRows.map(row => row.id).filter((value): value is number => Number.isFinite(value));
    const characterRows = accountIds.length > 0
        ? await fetchRows(`SELECT * FROM rpg_characters WHERE account_id IN (${accountIds.map(() => "?").join(",")})`, accountIds)
        : [];
    const characterIds = (characterRows as any[]).map(row => row.id).filter((value): value is number => Number.isFinite(value));
    const rpgData = characterIds.length > 0
        ? await Promise.all([
            fetchRows(`SELECT * FROM rpg_inventory WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_equipped_items WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_character_achievements WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_character_materials WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_character_pets WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_character_quests WHERE character_id IN (${characterIds.map(() => "?").join(",")})`, characterIds),
            fetchRows(`SELECT * FROM rpg_sessions WHERE account_id IN (${accountIds.map(() => "?").join(",")})`, accountIds),
            fetchRows(`SELECT * FROM rpg_account_status WHERE account_id IN (${accountIds.map(() => "?").join(",")})`, accountIds)
        ])
        : [[], [], [], [], [], [], [], []];

    return {
        exportedAt: new Date().toISOString(),
        userId,
        discordUsers,
        languages,
        messageCounts,
        globalMessages,
        registeredAccounts: accountRows.map(({ password, verification_code, token, password_reset_token, ...rest }) => rest),
        logins,
        warnings,
        memories,
        notificationReads,
        executedCommands,
        distinctMetrics,
        rpg: {
            characters: characterRows,
            inventory: rpgData[0],
            equippedItems: rpgData[1],
            characterAchievements: rpgData[2],
            characterMaterials: rpgData[3],
            characterPets: rpgData[4],
            characterQuests: rpgData[5],
            sessions: rpgData[6],
            accountStatus: rpgData[7]
        }
    };
};

const deleteUserData = async (userId: string) => {
    const accountRows = await fetchRows("SELECT id FROM registered_accounts WHERE uid = ?", [userId]);
    const accountIds = accountRows.map(row => row.id).filter((value): value is number => Number.isFinite(value));
    const characterRows = accountIds.length > 0
        ? await fetchRows(`SELECT id FROM rpg_characters WHERE account_id IN (${accountIds.map(() => "?").join(",")})`, accountIds)
        : [];
    const characterIds = characterRows.map(row => row.id).filter((value): value is number => Number.isFinite(value));
    const deleteStatements: Array<[string, any[]]> = [
        ["DELETE FROM discord_users WHERE id = ?", [userId]],
        ["DELETE FROM languages WHERE userid = ?", [userId]],
        ["DELETE FROM message_count WHERE uid = ?", [userId]],
        ["DELETE FROM global_messages WHERE uid = ?", [userId]],
        ["DELETE FROM registered_accounts WHERE uid = ?", [userId]],
        ["DELETE FROM logins WHERE uid = ?", [userId]],
        ["DELETE FROM ai_memories WHERE uid = ?", [userId]],
        ["DELETE FROM global_warnings WHERE userid = ? OR authorid = ?", [userId, userId]],
        ["DELETE FROM user_notification_reads WHERE user_id = ?", [userId]],
        ["DELETE FROM executed_commands WHERE uid = ?", [userId]],
        ["DELETE FROM daily_distinct_metrics WHERE entity_id = ?", [userId]],
        ["DELETE FROM staff_notes WHERE user_id = ? OR staff_id = ?", [userId, userId]],
        ["DELETE FROM support_tickets WHERE user_id = ?", [userId]],
        ["DELETE FROM support_messages WHERE user_id = ?", [userId]]
    ];

    if (accountIds.length > 0) {
        deleteStatements.push(
            ["DELETE FROM rpg_sessions WHERE account_id IN (" + accountIds.map(() => "?").join(",") + ")", accountIds],
            ["DELETE FROM rpg_account_status WHERE account_id IN (" + accountIds.map(() => "?").join(",") + ")", accountIds]
        );
    }

    if (characterIds.length > 0) {
        deleteStatements.push(
            ["DELETE FROM rpg_inventory WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_equipped_items WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_character_achievements WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_character_materials WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_character_pets WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_character_quests WHERE character_id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds],
            ["DELETE FROM rpg_characters WHERE id IN (" + characterIds.map(() => "?").join(",") + ")", characterIds]
        );
    }

    for (const [sql, params] of deleteStatements) {
        await db.query(sql, params);
    }

    return { accountIds: accountIds.length, characterIds: characterIds.length };
};

export default {
    data: new SlashCommandBuilder()
        .setName("data")
        .setDescription("Export or delete user data")
        .addSubcommand(s => s.setName("export")
            .setDescription("Export a user's stored data (Administrator+)")
            .addUserOption(option => option.setName("user").setDescription("User to export").setRequired(true)))
        .addSubcommand(s => s.setName("delete")
            .setDescription("Delete a user's stored data (Administrator+)")
            .addUserOption(option => option.setName("user").setDescription("User to delete").setRequired(true))
            .addStringOption(option => option.setName("confirm").setDescription("Type DELETE to confirm").setRequired(true))),
    category: "Admin",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return utils.safeInteractionRespond(interaction, "You must be an administrator to use this command.");
        }

        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getUser("user", true);

        if (sub === "export") {
            const payload = await buildExportPayload(user.id);
            const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(payload, null, 2)), { name: `data-export-${user.id}.json` });
            return utils.safeInteractionRespond(interaction, {
                content: `Exported data for ${user.tag}`,
                files: [attachment],
                ephemeral: true
            });
        }

        if (interaction.options.getString("confirm", true) !== "DELETE") {
            return utils.safeInteractionRespond(interaction, "Type DELETE in the confirm field to proceed.");
        }

        const result = await deleteUserData(user.id);
        return utils.safeInteractionRespond(interaction, {
            embeds: [new EmbedBuilder()
                .setColor("#E74C3C")
                .setTitle("🗑️ User Data Deleted")
                .setDescription(`Removed stored data for ${user.tag}.`)
                .addFields(
                    { name: "Accounts", value: String(result.accountIds), inline: true },
                    { name: "Characters", value: String(result.characterIds), inline: true }
                )
                .setTimestamp()],
            ephemeral: true
        });
    },
    ephemeral: true
};
