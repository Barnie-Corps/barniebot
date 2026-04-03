import Log from "../Log";
import db from "./database";
import type { ParsedTableSchema } from "../types/mysql";

const splitTopLevel = (value: string): string[] => {
    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        const prev = i > 0 ? value[i - 1] : "";
        if (char === "'" && !inDouble && prev !== "\\") inSingle = !inSingle;
        if (char === "\"" && !inSingle && prev !== "\\") inDouble = !inDouble;
        if (!inSingle && !inDouble) {
            if (char === "(") depth += 1;
            if (char === ")") depth = Math.max(0, depth - 1);
            if (char === "," && depth === 0) {
                if (current.trim()) result.push(current.trim());
                current = "";
                continue;
            }
        }
        current += char;
    }
    if (current.trim()) result.push(current.trim());
    return result;
};

const normalizeSql = (value: string): string => {
    return value
        .replace(/`/g, "")
        .replace(/\bboolean\b/gi, "tinyint(1)")
        .replace(/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/gi, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
};

const parseConstraintColumns = (fragment: string): string[] => {
    const match = fragment.match(/\((.+)\)/);
    if (!match) return [];
    return splitTopLevel(match[1])
        .map(part => part.trim().replace(/`/g, "").replace(/\(.+\)/, ""))
        .filter(Boolean);
};

const parseCreateTableStatement = (sql: string): ParsedTableSchema => {
    const tableMatch = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+([^\s(]+)/i);
    if (!tableMatch) throw new Error(`Unable to parse table name from schema: ${sql.slice(0, 80)}`);
    const tableName = tableMatch[1].replace(/`/g, "");
    const openIndex = sql.indexOf("(");
    const closeIndex = sql.lastIndexOf(")");
    const body = openIndex >= 0 && closeIndex > openIndex ? sql.slice(openIndex + 1, closeIndex) : "";
    const parts = splitTopLevel(body);
    const columns = new Map<string, string>();
    const primaryKeyColumns: string[] = [];
    const uniqueColumns = new Set<string>();
    const extraConstraints: string[] = [];

    for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;
        if (/^PRIMARY KEY\b/i.test(part)) {
            primaryKeyColumns.push(...parseConstraintColumns(part));
            continue;
        }
        if (/^(CONSTRAINT|FOREIGN KEY|UNIQUE KEY|KEY|INDEX)\b/i.test(part)) {
            extraConstraints.push(part);
            continue;
        }
        const columnMatch = part.match(/^`?([a-zA-Z0-9_]+)`?\s+([\s\S]+)$/);
        if (!columnMatch) continue;
        const columnName = columnMatch[1];
        let definition = `${columnName} ${columnMatch[2].trim()}`;
        if (/\bPRIMARY KEY\b/i.test(definition)) {
            primaryKeyColumns.push(columnName);
            definition = definition.replace(/\bPRIMARY KEY\b/gi, " ");
        }
        if (/\bUNIQUE\b/i.test(definition)) {
            uniqueColumns.add(columnName);
            definition = definition.replace(/\bUNIQUE\b/gi, " ");
        }
        definition = definition.replace(/\s+/g, " ").trim();
        columns.set(columnName, definition);
    }

    return {
        tableName,
        columns,
        primaryKeyColumns: Array.from(new Set(primaryKeyColumns)),
        uniqueColumns: Array.from(uniqueColumns),
        extraConstraints
    };
};

const getShowCreateTable = async (tableName: string): Promise<string> => {
    const rows = await db.query(`SHOW CREATE TABLE \`${tableName}\``) as unknown as any[];
    const row = rows?.[0] ?? {};
    return String(row["Create Table"] ?? row["Create View"] ?? "");
};

const ensurePrimaryKey = async (tableName: string, expectedColumns: string[]): Promise<void> => {
    if (expectedColumns.length === 0) return;
    const rows = await db.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = 'PRIMARY'`) as unknown as any[];
    const actualColumns = Array.isArray(rows)
        ? [...rows]
            .sort((a: any, b: any) => Number(a.Seq_in_index ?? 0) - Number(b.Seq_in_index ?? 0))
            .map((row: any) => String(row.Column_name ?? ""))
            .filter(Boolean)
        : [];
    if (normalizeSql(actualColumns.join(",")) === normalizeSql(expectedColumns.join(","))) return;
    if (actualColumns.length > 0) {
        try {
            await db.query(`ALTER TABLE \`${tableName}\` DROP PRIMARY KEY`);
        } catch {}
    }
    await db.query(`ALTER TABLE \`${tableName}\` ADD PRIMARY KEY (${expectedColumns.map(column => `\`${column}\``).join(", ")})`);
};

const ensureUniqueColumns = async (tableName: string, uniqueColumns: string[]): Promise<void> => {
    if (uniqueColumns.length === 0) return;
    const rows = await db.query(`SHOW INDEX FROM \`${tableName}\``) as unknown as any[];
    for (const column of uniqueColumns) {
        const exists = Array.isArray(rows) && rows.some((row: any) => Number(row.Non_unique) === 0 && String(row.Column_name ?? "") === column);
        if (exists) continue;
        await db.query(`ALTER TABLE \`${tableName}\` ADD UNIQUE (\`${column}\`)`);
    }
};

const ensureExtraConstraints = async (tableName: string, constraints: string[]): Promise<void> => {
    if (constraints.length === 0) return;
    let showCreate = normalizeSql(await getShowCreateTable(tableName));
    for (const constraint of constraints) {
        const normalizedConstraint = normalizeSql(constraint);
        if (showCreate.includes(normalizedConstraint)) continue;
        try {
            await db.query(`ALTER TABLE \`${tableName}\` ADD ${constraint}`);
            showCreate = normalizeSql(await getShowCreateTable(tableName));
        } catch (error: any) {
            Log.warn("Schema constraint ensure failed", { tableName, constraint, error: error?.message ?? String(error) });
        }
    }
};

const ensureTableFromSchema = async (createSql: string): Promise<void> => {
    const expected = parseCreateTableStatement(createSql);
    await db.query(createSql);
    let actual = parseCreateTableStatement(await getShowCreateTable(expected.tableName));

    for (const [columnName, definition] of expected.columns.entries()) {
        const actualDefinition = actual.columns.get(columnName);
        if (!actualDefinition) {
            await db.query(`ALTER TABLE \`${expected.tableName}\` ADD COLUMN ${definition}`);
            actual = parseCreateTableStatement(await getShowCreateTable(expected.tableName));
            continue;
        }
        if (normalizeSql(actualDefinition) === normalizeSql(definition)) continue;
        try {
            await db.query(`ALTER TABLE \`${expected.tableName}\` MODIFY COLUMN ${definition}`);
            actual = parseCreateTableStatement(await getShowCreateTable(expected.tableName));
        } catch (error: any) {
            Log.warn("Schema column reconcile failed", { tableName: expected.tableName, columnName, definition, error: error?.message ?? String(error) });
        }
    }

    try {
        await ensurePrimaryKey(expected.tableName, expected.primaryKeyColumns);
    } catch (error: any) {
        Log.warn("Schema primary key ensure failed", { tableName: expected.tableName, error: error?.message ?? String(error) });
    }

    try {
        await ensureUniqueColumns(expected.tableName, expected.uniqueColumns);
    } catch (error: any) {
        Log.warn("Schema unique ensure failed", { tableName: expected.tableName, error: error?.message ?? String(error) });
    }

    await ensureExtraConstraints(expected.tableName, expected.extraConstraints);
};

const tableDefinitions = [
        `CREATE TABLE IF NOT EXISTS global_warnings (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, userid VARCHAR(255) NOT NULL, reason TEXT NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt BIGINT(255) NOT NULL, points INT NOT NULL DEFAULT 1, category VARCHAR(50) NOT NULL DEFAULT 'general', expires_at BIGINT(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, appealed BOOLEAN NOT NULL DEFAULT FALSE, appeal_status VARCHAR(20) DEFAULT NULL, appeal_reason TEXT DEFAULT NULL, appeal_reviewed_by VARCHAR(255) DEFAULT NULL, appeal_reviewed_at BIGINT(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS staff_ranks (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL UNIQUE, hierarchy_position INT NOT NULL UNIQUE, permissions JSON NOT NULL, created_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS staff (uid VARCHAR(255) NOT NULL PRIMARY KEY, rank VARCHAR(64) NOT NULL, hierarchy_position INT NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS global_mutes (id VARCHAR(255) NOT NULL PRIMARY KEY, reason VARCHAR(255) NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt BIGINT(255) NOT NULL, until BIGINT(255) NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS languages (userid VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'en')`,
        `CREATE TABLE IF NOT EXISTS discord_users (id VARCHAR(255) NOT NULL, pfp VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL DEFAULT 'Unknown User', command_executions INT(255) NOT NULL DEFAULT 1)`,
        `CREATE TABLE IF NOT EXISTS executed_commands (command VARCHAR(255) NOT NULL, uid VARCHAR(255) NOT NULL DEFAULT 0, at INT(255) NOT NULL DEFAULT 0, is_last BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS globalchats (guild VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, banned BOOLEAN NOT NULL DEFAULT FALSE, autotranslate BOOLEAN NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es', webhook_token VARCHAR(255) NOT NULL, webhook_id VARCHAR(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS global_messages (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, content TEXT NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es')`,
        `CREATE TABLE IF NOT EXISTS guilds (id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, member_count INT(255) NOT NULL DEFAULT 2, is_in BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS global_bans (id VARCHAR(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, times INT(255) NOT NULL DEFAULT 1)`,
        `CREATE TABLE IF NOT EXISTS filter_configs (guild VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, log_channel VARCHAR(255) NOT NULL DEFAULT '0', enabled_logs BOOLEAN NOT NULL DEFAULT FALSE, lang VARCHAR(2) NOT NULL DEFAULT 'en')`,
        `CREATE TABLE IF NOT EXISTS filter_words (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, guild VARCHAR(255) NOT NULL, content VARCHAR(255) NOT NULL DEFAULT '', protected BOOLEAN NOT NULL DEFAULT FALSE, single BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS filter_webhooks (id VARCHAR(255) NOT NULL, token VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS vip_users (id VARCHAR(255) NOT NULL, start_date BIGINT(255) NOT NULL, end_date BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS vip_guilds (guild_id VARCHAR(255) NOT NULL PRIMARY KEY, start_date BIGINT(255) NOT NULL, end_date BIGINT(255) NOT NULL, added_by VARCHAR(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS ai_chat_daily_usage (user_id VARCHAR(255) NOT NULL, usage_date VARCHAR(10) NOT NULL, messages_used INT NOT NULL DEFAULT 0, updated_at BIGINT(255) NOT NULL, PRIMARY KEY (user_id, usage_date))`,
        `CREATE TABLE IF NOT EXISTS registered_accounts (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, password TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE, verification_code VARCHAR(255) NOT NULL, verified_at BIGINT(255) NOT NULL DEFAULT 0, created_at BIGINT(255) NOT NULL, last_login BIGINT(255) NOT NULL DEFAULT 0, last_user_logged VARCHAR(255) NOT NULL DEFAULT '0', token VARCHAR(255) NOT NULL DEFAULT '0')`,
        `CREATE TABLE IF NOT EXISTS logins (id INT PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, at BIGINT(255) NOT NULL, status BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS message_count (uid VARCHAR(255) NOT NULL, count INT(255) NOT NULL DEFAULT 1)`,
        `CREATE TABLE IF NOT EXISTS ai_memories (id INT PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, memory TEXT NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS custom_responses (id INT PRIMARY KEY AUTO_INCREMENT, guild VARCHAR(255) NOT NULL, command VARCHAR(255) NOT NULL, response TEXT NOT NULL, is_regex BOOLEAN NOT NULL DEFAULT FALSE)`,
        `CREATE TABLE IF NOT EXISTS support_tickets (id INT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(255) NOT NULL, channel_id VARCHAR(255) NOT NULL, message_id VARCHAR(255) DEFAULT NULL, status VARCHAR(50) NOT NULL DEFAULT 'open', assigned_to VARCHAR(255) DEFAULT NULL, created_at BIGINT(255) NOT NULL, closed_at BIGINT(255) DEFAULT NULL, closed_by VARCHAR(255) DEFAULT NULL, first_response_at BIGINT(255) DEFAULT NULL, first_response_by VARCHAR(255) DEFAULT NULL, initial_message TEXT, guild_id VARCHAR(255) DEFAULT NULL, guild_name VARCHAR(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS support_messages (id INT PRIMARY KEY AUTO_INCREMENT, ticket_id INT NOT NULL, user_id VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, content TEXT NOT NULL, timestamp BIGINT(255) NOT NULL, is_staff BOOLEAN NOT NULL DEFAULT FALSE, staff_rank VARCHAR(64) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS local_ticket_configs (guild_id VARCHAR(255) NOT NULL PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, category_id VARCHAR(255) NOT NULL, transcripts_channel_id VARCHAR(255) DEFAULT NULL, support_role_ids JSON DEFAULT NULL, created_at BIGINT(255) NOT NULL, updated_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS local_tickets (id INT PRIMARY KEY AUTO_INCREMENT, guild_id VARCHAR(255) NOT NULL, channel_id VARCHAR(255) NOT NULL, creator_id VARCHAR(255) NOT NULL, opener_message_id VARCHAR(255) DEFAULT NULL, initial_message TEXT NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'open', created_at BIGINT(255) NOT NULL, closed_at BIGINT(255) DEFAULT NULL, closed_by VARCHAR(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS staff_status (user_id VARCHAR(255) PRIMARY KEY, status VARCHAR(20) NOT NULL DEFAULT 'offline', status_message VARCHAR(255) DEFAULT NULL, updated_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS staff_notes (id INT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(255) NOT NULL, staff_id VARCHAR(255) NOT NULL, note TEXT NOT NULL, created_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS staff_audit_log (id INT PRIMARY KEY AUTO_INCREMENT, staff_id VARCHAR(255) NOT NULL, action_type VARCHAR(50) NOT NULL, target_id VARCHAR(255) DEFAULT NULL, details TEXT, metadata JSON DEFAULT NULL, created_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS ai_monitor_configs (guild_id VARCHAR(255) NOT NULL PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE, logs_channel VARCHAR(255) NOT NULL DEFAULT '0', allow_actions BOOLEAN NOT NULL DEFAULT FALSE, analyze_potentially BOOLEAN NOT NULL DEFAULT FALSE, allow_investigation_tools BOOLEAN NOT NULL DEFAULT FALSE, monitor_language VARCHAR(5) NOT NULL DEFAULT 'en', channel_whitelist_ids JSON DEFAULT NULL, role_whitelist_ids JSON DEFAULT NULL, created_at BIGINT(255) NOT NULL, updated_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS ai_monitor_cases (case_id VARCHAR(64) NOT NULL PRIMARY KEY, guild_id VARCHAR(255) NOT NULL, event_type VARCHAR(50) NOT NULL, user_id VARCHAR(255) DEFAULT NULL, channel_id VARCHAR(255) DEFAULT NULL, message_id VARCHAR(255) DEFAULT NULL, summary TEXT, risk VARCHAR(20) NOT NULL DEFAULT 'low', recommended_action VARCHAR(32) NOT NULL DEFAULT 'notify', recommended_actions JSON DEFAULT NULL, action_payload JSON DEFAULT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open', created_at BIGINT(255) NOT NULL, updated_at BIGINT(255) NOT NULL, log_channel_id VARCHAR(255) DEFAULT NULL, log_message_id VARCHAR(255) DEFAULT NULL, allow_actions BOOLEAN NOT NULL DEFAULT FALSE, auto_action_taken BOOLEAN NOT NULL DEFAULT FALSE, reason TEXT, confidence DECIMAL(4,3) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS ai_monitor_entity_stats (guild_id VARCHAR(255) NOT NULL, entity_key VARCHAR(320) NOT NULL, entity_type VARCHAR(32) NOT NULL, risk_score DECIMAL(8,3) NOT NULL DEFAULT 0, flag_count INT NOT NULL DEFAULT 0, action_count INT NOT NULL DEFAULT 0, false_positive_count INT NOT NULL DEFAULT 0, last_flag_at BIGINT(255) DEFAULT NULL, last_action_at BIGINT(255) DEFAULT NULL, updated_at BIGINT(255) NOT NULL, PRIMARY KEY (guild_id, entity_key))`,
        `CREATE TABLE IF NOT EXISTS global_notifications (id INT PRIMARY KEY AUTO_INCREMENT, content TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL, language VARCHAR(5) NOT NULL DEFAULT 'en', created_by VARCHAR(255) NOT NULL, created_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS user_notification_reads (user_id VARCHAR(255) NOT NULL, notification_id INT NOT NULL, read_at BIGINT(255) NOT NULL, PRIMARY KEY (user_id, notification_id))`,
        `CREATE TABLE IF NOT EXISTS rpg_characters (id INT PRIMARY KEY AUTO_INCREMENT, account_id INT NOT NULL, uid VARCHAR(255) NOT NULL, name VARCHAR(50) NOT NULL, class VARCHAR(30) NOT NULL, level INT NOT NULL DEFAULT 1, experience BIGINT NOT NULL DEFAULT 0, hp INT NOT NULL DEFAULT 100, max_hp INT NOT NULL DEFAULT 100, mp INT NOT NULL DEFAULT 50, max_mp INT NOT NULL DEFAULT 50, strength INT NOT NULL DEFAULT 10, defense INT NOT NULL DEFAULT 10, agility INT NOT NULL DEFAULT 10, intelligence INT NOT NULL DEFAULT 10, luck INT NOT NULL DEFAULT 10, stat_points INT NOT NULL DEFAULT 0, gold BIGINT NOT NULL DEFAULT 100, created_at BIGINT(255) NOT NULL, last_action BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_sessions (id INT PRIMARY KEY AUTO_INCREMENT, account_id INT NOT NULL UNIQUE, uid VARCHAR(255) NOT NULL, logged_in_at BIGINT(255) NOT NULL, last_activity BIGINT(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS rpg_account_status (account_id INT PRIMARY KEY, frozen BOOLEAN NOT NULL DEFAULT FALSE, frozen_reason TEXT DEFAULT NULL, frozen_by VARCHAR(255) DEFAULT NULL, frozen_at BIGINT(255) DEFAULT NULL, banned BOOLEAN NOT NULL DEFAULT FALSE, banned_reason TEXT DEFAULT NULL, banned_by VARCHAR(255) DEFAULT NULL, banned_at BIGINT(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_items (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT, type VARCHAR(30) NOT NULL, rarity VARCHAR(20) NOT NULL DEFAULT 'common', base_value INT NOT NULL DEFAULT 10, tradeable BOOLEAN NOT NULL DEFAULT TRUE, stackable BOOLEAN NOT NULL DEFAULT FALSE, max_stack INT NOT NULL DEFAULT 1)`,
        `CREATE TABLE IF NOT EXISTS rpg_equipment (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, slot VARCHAR(30) NOT NULL, required_level INT NOT NULL DEFAULT 1, required_class VARCHAR(30) DEFAULT NULL, strength_bonus INT NOT NULL DEFAULT 0, defense_bonus INT NOT NULL DEFAULT 0, agility_bonus INT NOT NULL DEFAULT 0, intelligence_bonus INT NOT NULL DEFAULT 0, luck_bonus INT NOT NULL DEFAULT 0, hp_bonus INT NOT NULL DEFAULT 0, mp_bonus INT NOT NULL DEFAULT 0, special_effect VARCHAR(100) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_weapons (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, weapon_type VARCHAR(30) NOT NULL, min_damage INT NOT NULL DEFAULT 1, max_damage INT NOT NULL DEFAULT 5, attack_speed DECIMAL(3,2) NOT NULL DEFAULT 1.00, critical_chance DECIMAL(5,2) NOT NULL DEFAULT 5.00, required_level INT NOT NULL DEFAULT 1, required_class VARCHAR(30) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_consumables (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, effect_type VARCHAR(30) NOT NULL, effect_value INT NOT NULL, duration INT NOT NULL DEFAULT 0, cooldown INT NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS rpg_inventory (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, item_id INT NOT NULL, quantity INT NOT NULL DEFAULT 1, acquired_at BIGINT(255) NOT NULL, bound BOOLEAN NOT NULL DEFAULT FALSE)`,
        `CREATE TABLE IF NOT EXISTS rpg_equipped_items (character_id INT NOT NULL, slot VARCHAR(30) NOT NULL, item_id INT NOT NULL, inventory_id INT NOT NULL, equipped_at BIGINT(255) NOT NULL, PRIMARY KEY (character_id, slot))`,
        `CREATE TABLE IF NOT EXISTS rpg_combat_logs (id INT PRIMARY KEY AUTO_INCREMENT, attacker_id INT NOT NULL, defender_id INT DEFAULT NULL, action_type VARCHAR(30) NOT NULL, damage_dealt INT NOT NULL DEFAULT 0, hp_remaining INT NOT NULL, result VARCHAR(20) NOT NULL, occurred_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_quests (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, reward_gold INT NOT NULL DEFAULT 0, reward_experience INT NOT NULL DEFAULT 0, reward_item_id INT DEFAULT NULL, repeatable BOOLEAN NOT NULL DEFAULT FALSE, cooldown INT NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS rpg_character_quests (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, quest_id INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'active', progress INT NOT NULL DEFAULT 0, accepted_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL, last_completion BIGINT(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_skills (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, class VARCHAR(30) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, mp_cost INT NOT NULL DEFAULT 10, cooldown INT NOT NULL DEFAULT 0, damage_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00, effect_type VARCHAR(30) DEFAULT NULL, effect_value INT DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_character_skills (character_id INT NOT NULL, skill_id INT NOT NULL, level INT NOT NULL DEFAULT 1, last_used BIGINT(255) DEFAULT NULL, PRIMARY KEY (character_id, skill_id))`,
        `CREATE TABLE IF NOT EXISTS rpg_trades (id INT PRIMARY KEY AUTO_INCREMENT, initiator_id INT NOT NULL, receiver_id INT NOT NULL, initiator_gold BIGINT NOT NULL DEFAULT 0, initiator_items TEXT, receiver_gold BIGINT NOT NULL DEFAULT 0, receiver_items TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_guilds (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL UNIQUE, description TEXT, founder_id INT NOT NULL, level INT NOT NULL DEFAULT 1, experience BIGINT NOT NULL DEFAULT 0, gold BIGINT NOT NULL DEFAULT 0, member_capacity INT NOT NULL DEFAULT 20, created_at BIGINT(255) NOT NULL, emblem_icon VARCHAR(50) DEFAULT '🛡️')`,
        `CREATE TABLE IF NOT EXISTS rpg_guild_members (character_id INT NOT NULL, guild_id INT NOT NULL, role VARCHAR(30) NOT NULL DEFAULT 'member', joined_at BIGINT(255) NOT NULL, contribution_points INT NOT NULL DEFAULT 0, PRIMARY KEY (character_id, guild_id))`,
        `CREATE TABLE IF NOT EXISTS rpg_guild_upgrades (id INT PRIMARY KEY AUTO_INCREMENT, guild_id INT NOT NULL, upgrade_type VARCHAR(50) NOT NULL, level INT NOT NULL DEFAULT 1, bonus_value INT NOT NULL DEFAULT 0, purchased_at BIGINT(255) NOT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_achievements (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, category VARCHAR(30) NOT NULL, requirement_type VARCHAR(50) NOT NULL, requirement_value INT NOT NULL, reward_gold INT NOT NULL DEFAULT 0, reward_experience INT NOT NULL DEFAULT 0, reward_item_id INT DEFAULT NULL, icon VARCHAR(20) DEFAULT '🏆', hidden BOOLEAN NOT NULL DEFAULT FALSE)`,
        `CREATE TABLE IF NOT EXISTS rpg_character_achievements (character_id INT NOT NULL, achievement_id INT NOT NULL, progress INT NOT NULL DEFAULT 0, unlocked BOOLEAN NOT NULL DEFAULT FALSE, unlocked_at BIGINT(255) DEFAULT NULL, PRIMARY KEY (character_id, achievement_id))`,
        `CREATE TABLE IF NOT EXISTS rpg_daily_rewards (character_id INT PRIMARY KEY, last_claim BIGINT(255) NOT NULL, streak INT NOT NULL DEFAULT 0, total_claims INT NOT NULL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS rpg_dungeons (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, difficulty VARCHAR(20) NOT NULL, stages INT NOT NULL DEFAULT 3, boss_name VARCHAR(50), reward_gold_min INT NOT NULL DEFAULT 100, reward_gold_max INT NOT NULL DEFAULT 500, reward_exp_min INT NOT NULL DEFAULT 200, reward_exp_max INT NOT NULL DEFAULT 1000, cooldown INT NOT NULL DEFAULT 3600000)`,
        `CREATE TABLE IF NOT EXISTS rpg_dungeon_runs (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, dungeon_id INT NOT NULL, stage INT NOT NULL DEFAULT 1, status VARCHAR(20) NOT NULL DEFAULT 'in_progress', started_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL, rewards_claimed BOOLEAN NOT NULL DEFAULT FALSE)`,
        `CREATE TABLE IF NOT EXISTS rpg_pets (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, description TEXT, rarity VARCHAR(20) NOT NULL DEFAULT 'common', base_price INT NOT NULL DEFAULT 500, strength_bonus INT NOT NULL DEFAULT 0, defense_bonus INT NOT NULL DEFAULT 0, agility_bonus INT NOT NULL DEFAULT 0, intelligence_bonus INT NOT NULL DEFAULT 0, luck_bonus INT NOT NULL DEFAULT 0, special_ability VARCHAR(100) DEFAULT NULL, emoji VARCHAR(20) DEFAULT '🐾')`,
        `CREATE TABLE IF NOT EXISTS rpg_character_pets (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, pet_id INT NOT NULL, name VARCHAR(50) NOT NULL, level INT NOT NULL DEFAULT 1, experience INT NOT NULL DEFAULT 0, happiness INT NOT NULL DEFAULT 100, is_active BOOLEAN NOT NULL DEFAULT FALSE, acquired_at BIGINT(255) NOT NULL, last_fed BIGINT(255) DEFAULT NULL)`,
        `CREATE TABLE IF NOT EXISTS rpg_crafting_materials (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, description TEXT, rarity VARCHAR(20) NOT NULL DEFAULT 'common', stack_size INT NOT NULL DEFAULT 999, drop_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00, emoji VARCHAR(20) DEFAULT '⚙️')`,
        `CREATE TABLE IF NOT EXISTS rpg_crafting_recipes (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, result_item_id INT NOT NULL, required_level INT NOT NULL DEFAULT 1, material_1_id INT DEFAULT NULL, material_1_qty INT DEFAULT NULL, material_2_id INT DEFAULT NULL, material_2_qty INT DEFAULT NULL, material_3_id INT DEFAULT NULL, material_3_qty INT DEFAULT NULL, gold_cost INT NOT NULL DEFAULT 0, success_rate DECIMAL(5,2) NOT NULL DEFAULT 100.00)`,
        `CREATE TABLE IF NOT EXISTS rpg_character_materials (character_id INT NOT NULL, material_id INT NOT NULL, quantity INT NOT NULL DEFAULT 0, PRIMARY KEY (character_id, material_id))`,
        `CREATE TABLE IF NOT EXISTS rpg_market_listings (id INT PRIMARY KEY AUTO_INCREMENT, seller_id INT NOT NULL, item_id INT NOT NULL, quantity INT NOT NULL DEFAULT 1, price_per_unit INT NOT NULL, listed_at BIGINT(255) NOT NULL, expires_at BIGINT(255) NOT NULL, sold BOOLEAN NOT NULL DEFAULT FALSE)`,
        `CREATE TABLE IF NOT EXISTS rpg_boss_encounters (id INT PRIMARY KEY AUTO_INCREMENT, boss_name VARCHAR(50) NOT NULL, boss_hp INT NOT NULL, boss_atk INT NOT NULL, boss_def INT NOT NULL, reward_multiplier DECIMAL(3,2) NOT NULL DEFAULT 2.00, spawn_chance DECIMAL(5,2) NOT NULL DEFAULT 5.00, emoji VARCHAR(20) DEFAULT '👑')`,
        `CREATE TABLE IF NOT EXISTS staff_permissions (rank_name VARCHAR(64) NOT NULL, permission VARCHAR(100) NOT NULL, PRIMARY KEY (rank_name, permission), FOREIGN KEY (rank_name) REFERENCES staff_ranks(name) ON DELETE CASCADE)`,
        `CREATE TABLE IF NOT EXISTS ai_chat_sessions (session_id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(255) NOT NULL, title VARCHAR(255) DEFAULT NULL, created_at BIGINT(255) NOT NULL, updated_at BIGINT(255) NOT NULL, message_count INT NOT NULL DEFAULT 0, context_summary TEXT DEFAULT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE)`,
        `CREATE TABLE IF NOT EXISTS ai_chat_messages (id INT PRIMARY KEY AUTO_INCREMENT, session_id VARCHAR(64) NOT NULL, role VARCHAR(20) NOT NULL, content TEXT NOT NULL, tool_calls JSON DEFAULT NULL, tool_results JSON DEFAULT NULL, created_at BIGINT(255) NOT NULL, compressed BOOLEAN NOT NULL DEFAULT FALSE, INDEX idx_session_id (session_id))`,
        `CREATE TABLE IF NOT EXISTS ai_memory_graph (id INT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(255) NOT NULL, memory_type VARCHAR(50) NOT NULL, subject VARCHAR(255) NOT NULL, content TEXT NOT NULL, related_entities JSON DEFAULT NULL, confidence DECIMAL(4,3) NOT NULL DEFAULT 1.000, created_at BIGINT(255) NOT NULL, updated_at BIGINT(255) NOT NULL, last_accessed BIGINT(255) DEFAULT NULL, access_count INT NOT NULL DEFAULT 0, INDEX idx_user_type (user_id, memory_type), INDEX idx_subject (subject))`
];

export default async function queries(): Promise<void> {
    for (const createSql of tableDefinitions) {
        await ensureTableFromSchema(createSql);
    }
    Log.info("Database tables ensured", { component: "Database", tables: tableDefinitions.length });
}
