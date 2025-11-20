import Log from "../Log";
import db from "./database";
export default function queries(): void {
    db.query("CREATE TABLE IF NOT EXISTS global_warnings (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, userid VARCHAR(255) NOT NULL, reason TEXT NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt BIGINT(255) NOT NULL, points INT NOT NULL DEFAULT 1, category VARCHAR(50) NOT NULL DEFAULT 'general', expires_at BIGINT(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, appealed BOOLEAN NOT NULL DEFAULT FALSE, appeal_status VARCHAR(20) DEFAULT NULL, appeal_reason TEXT DEFAULT NULL, appeal_reviewed_by VARCHAR(255) DEFAULT NULL, appeal_reviewed_at BIGINT(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS staff (uid VARCHAR(255) NOT NULL PRIMARY KEY, rank VARCHAR(64) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS global_mutes (id VARCHAR(255) NOT NULL PRIMARY KEY, reason VARCHAR(255) NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt BIGINT(255) NOT NULL, until BIGINT(255) NOT NULL DEFAULT 0)");
    
    db.query("CREATE TABLE IF NOT EXISTS languages (userid VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'en')");
    
    db.query("CREATE TABLE IF NOT EXISTS discord_users (id VARCHAR(255) NOT NULL, pfp VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL DEFAULT 'Unknown User', command_executions INT(255) NOT NULL DEFAULT 1)");
    
    db.query("CREATE TABLE IF NOT EXISTS executed_commands (command VARCHAR(255) NOT NULL, uid VARCHAR(255) NOT NULL DEFAULT 0, at INT(255) NOT NULL DEFAULT 0, is_last BOOLEAN NOT NULL DEFAULT TRUE)");
    
    db.query("CREATE TABLE IF NOT EXISTS globalchats (guild VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, banned BOOLEAN NOT NULL DEFAULT FALSE, autotranslate BOOLEAN NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es', webhook_token VARCHAR(255) NOT NULL, webhook_id VARCHAR(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS global_messages (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, content TEXT NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es')");
    
    db.query("CREATE TABLE IF NOT EXISTS guilds (id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, member_count INT(255) NOT NULL DEFAULT 2, is_in BOOLEAN NOT NULL DEFAULT TRUE)");
    
    db.query("CREATE TABLE IF NOT EXISTS global_bans (id VARCHAR(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, times INT(255) NOT NULL DEFAULT 1)");
    
    db.query("CREATE TABLE IF NOT EXISTS filter_configs (guild VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, log_channel VARCHAR(255) NOT NULL DEFAULT '0', enabled_logs BOOLEAN NOT NULL DEFAULT FALSE, lang VARCHAR(2) NOT NULL DEFAULT 'en')");
    
    db.query("CREATE TABLE IF NOT EXISTS filter_words (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, guild VARCHAR(255) NOT NULL, content VARCHAR(255) NOT NULL DEFAULT '', protected BOOLEAN NOT NULL DEFAULT FALSE, single BOOLEAN NOT NULL DEFAULT TRUE)"); // Single means the word must be alone in the message, not part of another word
    
    db.query("CREATE TABLE IF NOT EXISTS filter_webhooks (id VARCHAR(255) NOT NULL, token VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS vip_users (id VARCHAR(255) NOT NULL, start_date BIGINT(255) NOT NULL, end_date BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS registered_accounts (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, password TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE, verification_code VARCHAR(255) NOT NULL, verified_at BIGINT(255) NOT NULL DEFAULT 0, created_at BIGINT(255) NOT NULL, last_login BIGINT(255) NOT NULL DEFAULT 0, last_user_logged VARCHAR(255) NOT NULL DEFAULT '0', token VARCHAR(255) NOT NULL DEFAULT '0')");
    
    db.query("CREATE TABLE IF NOT EXISTS logins (id INT PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, at BIGINT(255) NOT NULL, status BOOLEAN NOT NULL DEFAULT TRUE)");
    
    db.query("CREATE TABLE IF NOT EXISTS message_count (uid VARCHAR(255) NOT NULL, count INT(255) NOT NULL DEFAULT 1)");
    
    db.query("CREATE TABLE IF NOT EXISTS ai_memories (id INT PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, memory TEXT NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS custom_responses (id INT PRIMARY KEY AUTO_INCREMENT, guild VARCHAR(255) NOT NULL, command VARCHAR(255) NOT NULL, response TEXT NOT NULL, is_regex BOOLEAN NOT NULL DEFAULT FALSE)");
    
    db.query("CREATE TABLE IF NOT EXISTS support_tickets (id INT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(255) NOT NULL, channel_id VARCHAR(255) NOT NULL, message_id VARCHAR(255) DEFAULT NULL, status VARCHAR(50) NOT NULL DEFAULT 'open', priority VARCHAR(20) DEFAULT 'medium', category VARCHAR(50) DEFAULT 'general', assigned_to VARCHAR(255) DEFAULT NULL, created_at BIGINT(255) NOT NULL, closed_at BIGINT(255) DEFAULT NULL, closed_by VARCHAR(255) DEFAULT NULL, first_response_at BIGINT(255) DEFAULT NULL, first_response_by VARCHAR(255) DEFAULT NULL, initial_message TEXT, guild_id VARCHAR(255) DEFAULT NULL, guild_name VARCHAR(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS support_messages (id INT PRIMARY KEY AUTO_INCREMENT, ticket_id INT NOT NULL, user_id VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, content TEXT NOT NULL, timestamp BIGINT(255) NOT NULL, is_staff BOOLEAN NOT NULL DEFAULT FALSE, staff_rank VARCHAR(64) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS staff_status (user_id VARCHAR(255) PRIMARY KEY, status VARCHAR(20) NOT NULL DEFAULT 'offline', status_message VARCHAR(255) DEFAULT NULL, updated_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS staff_notes (id INT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(255) NOT NULL, staff_id VARCHAR(255) NOT NULL, note TEXT NOT NULL, created_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS staff_audit_log (id INT PRIMARY KEY AUTO_INCREMENT, staff_id VARCHAR(255) NOT NULL, action_type VARCHAR(50) NOT NULL, target_id VARCHAR(255) DEFAULT NULL, details TEXT, metadata JSON DEFAULT NULL, created_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS global_notifications (id INT PRIMARY KEY AUTO_INCREMENT, content TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL, language VARCHAR(5) NOT NULL DEFAULT 'en', created_by VARCHAR(255) NOT NULL, created_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS user_notification_reads (user_id VARCHAR(255) NOT NULL, notification_id INT NOT NULL, read_at BIGINT(255) NOT NULL, PRIMARY KEY (user_id, notification_id))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_characters (id INT PRIMARY KEY AUTO_INCREMENT, account_id INT NOT NULL, uid VARCHAR(255) NOT NULL, name VARCHAR(50) NOT NULL, class VARCHAR(30) NOT NULL, level INT NOT NULL DEFAULT 1, experience BIGINT NOT NULL DEFAULT 0, hp INT NOT NULL DEFAULT 100, max_hp INT NOT NULL DEFAULT 100, mp INT NOT NULL DEFAULT 50, max_mp INT NOT NULL DEFAULT 50, strength INT NOT NULL DEFAULT 10, defense INT NOT NULL DEFAULT 10, agility INT NOT NULL DEFAULT 10, intelligence INT NOT NULL DEFAULT 10, luck INT NOT NULL DEFAULT 10, stat_points INT NOT NULL DEFAULT 0, gold BIGINT NOT NULL DEFAULT 100, created_at BIGINT(255) NOT NULL, last_action BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_sessions (id INT PRIMARY KEY AUTO_INCREMENT, account_id INT NOT NULL UNIQUE, uid VARCHAR(255) NOT NULL, logged_in_at BIGINT(255) NOT NULL, last_activity BIGINT(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_account_status (account_id INT PRIMARY KEY, frozen BOOLEAN NOT NULL DEFAULT FALSE, frozen_reason TEXT DEFAULT NULL, frozen_by VARCHAR(255) DEFAULT NULL, frozen_at BIGINT(255) DEFAULT NULL, banned BOOLEAN NOT NULL DEFAULT FALSE, banned_reason TEXT DEFAULT NULL, banned_by VARCHAR(255) DEFAULT NULL, banned_at BIGINT(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_items (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT, type VARCHAR(30) NOT NULL, rarity VARCHAR(20) NOT NULL DEFAULT 'common', base_value INT NOT NULL DEFAULT 10, tradeable BOOLEAN NOT NULL DEFAULT TRUE, stackable BOOLEAN NOT NULL DEFAULT FALSE, max_stack INT NOT NULL DEFAULT 1)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_equipment (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, slot VARCHAR(30) NOT NULL, required_level INT NOT NULL DEFAULT 1, required_class VARCHAR(30) DEFAULT NULL, strength_bonus INT NOT NULL DEFAULT 0, defense_bonus INT NOT NULL DEFAULT 0, agility_bonus INT NOT NULL DEFAULT 0, intelligence_bonus INT NOT NULL DEFAULT 0, luck_bonus INT NOT NULL DEFAULT 0, hp_bonus INT NOT NULL DEFAULT 0, mp_bonus INT NOT NULL DEFAULT 0, special_effect VARCHAR(100) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_weapons (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, weapon_type VARCHAR(30) NOT NULL, min_damage INT NOT NULL DEFAULT 1, max_damage INT NOT NULL DEFAULT 5, attack_speed DECIMAL(3,2) NOT NULL DEFAULT 1.00, critical_chance DECIMAL(5,2) NOT NULL DEFAULT 5.00, required_level INT NOT NULL DEFAULT 1, required_class VARCHAR(30) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_consumables (id INT PRIMARY KEY AUTO_INCREMENT, item_id INT NOT NULL, effect_type VARCHAR(30) NOT NULL, effect_value INT NOT NULL, duration INT NOT NULL DEFAULT 0, cooldown INT NOT NULL DEFAULT 0)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_inventory (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, item_id INT NOT NULL, quantity INT NOT NULL DEFAULT 1, acquired_at BIGINT(255) NOT NULL, bound BOOLEAN NOT NULL DEFAULT FALSE)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_equipped_items (character_id INT NOT NULL, slot VARCHAR(30) NOT NULL, item_id INT NOT NULL, inventory_id INT NOT NULL, equipped_at BIGINT(255) NOT NULL, PRIMARY KEY (character_id, slot))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_combat_logs (id INT PRIMARY KEY AUTO_INCREMENT, attacker_id INT NOT NULL, defender_id INT DEFAULT NULL, action_type VARCHAR(30) NOT NULL, damage_dealt INT NOT NULL DEFAULT 0, hp_remaining INT NOT NULL, result VARCHAR(20) NOT NULL, occurred_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_quests (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, reward_gold INT NOT NULL DEFAULT 0, reward_experience INT NOT NULL DEFAULT 0, reward_item_id INT DEFAULT NULL, repeatable BOOLEAN NOT NULL DEFAULT FALSE, cooldown INT NOT NULL DEFAULT 0)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_character_quests (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, quest_id INT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'active', progress INT NOT NULL DEFAULT 0, accepted_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL, last_completion BIGINT(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_skills (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, class VARCHAR(30) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, mp_cost INT NOT NULL DEFAULT 10, cooldown INT NOT NULL DEFAULT 0, damage_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00, effect_type VARCHAR(30) DEFAULT NULL, effect_value INT DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_character_skills (character_id INT NOT NULL, skill_id INT NOT NULL, level INT NOT NULL DEFAULT 1, last_used BIGINT(255) DEFAULT NULL, PRIMARY KEY (character_id, skill_id))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_trades (id INT PRIMARY KEY AUTO_INCREMENT, initiator_id INT NOT NULL, receiver_id INT NOT NULL, initiator_gold BIGINT NOT NULL DEFAULT 0, initiator_items TEXT, receiver_gold BIGINT NOT NULL DEFAULT 0, receiver_items TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_guilds (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL UNIQUE, description TEXT, founder_id INT NOT NULL, level INT NOT NULL DEFAULT 1, experience BIGINT NOT NULL DEFAULT 0, gold BIGINT NOT NULL DEFAULT 0, member_capacity INT NOT NULL DEFAULT 20, created_at BIGINT(255) NOT NULL, emblem_icon VARCHAR(50) DEFAULT '🛡️')");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_guild_members (character_id INT NOT NULL, guild_id INT NOT NULL, role VARCHAR(30) NOT NULL DEFAULT 'member', joined_at BIGINT(255) NOT NULL, contribution_points INT NOT NULL DEFAULT 0, PRIMARY KEY (character_id, guild_id))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_guild_upgrades (id INT PRIMARY KEY AUTO_INCREMENT, guild_id INT NOT NULL, upgrade_type VARCHAR(50) NOT NULL, level INT NOT NULL DEFAULT 1, bonus_value INT NOT NULL DEFAULT 0, purchased_at BIGINT(255) NOT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_achievements (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, category VARCHAR(30) NOT NULL, requirement_type VARCHAR(50) NOT NULL, requirement_value INT NOT NULL, reward_gold INT NOT NULL DEFAULT 0, reward_experience INT NOT NULL DEFAULT 0, reward_item_id INT DEFAULT NULL, icon VARCHAR(20) DEFAULT '🏆', hidden BOOLEAN NOT NULL DEFAULT FALSE)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_character_achievements (character_id INT NOT NULL, achievement_id INT NOT NULL, progress INT NOT NULL DEFAULT 0, unlocked BOOLEAN NOT NULL DEFAULT FALSE, unlocked_at BIGINT(255) DEFAULT NULL, PRIMARY KEY (character_id, achievement_id))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_daily_rewards (character_id INT PRIMARY KEY, last_claim BIGINT(255) NOT NULL, streak INT NOT NULL DEFAULT 0, total_claims INT NOT NULL DEFAULT 0)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_dungeons (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, description TEXT NOT NULL, required_level INT NOT NULL DEFAULT 1, difficulty VARCHAR(20) NOT NULL, stages INT NOT NULL DEFAULT 3, boss_name VARCHAR(50), reward_gold_min INT NOT NULL DEFAULT 100, reward_gold_max INT NOT NULL DEFAULT 500, reward_exp_min INT NOT NULL DEFAULT 200, reward_exp_max INT NOT NULL DEFAULT 1000, cooldown INT NOT NULL DEFAULT 3600000)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_dungeon_runs (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, dungeon_id INT NOT NULL, stage INT NOT NULL DEFAULT 1, status VARCHAR(20) NOT NULL DEFAULT 'in_progress', started_at BIGINT(255) NOT NULL, completed_at BIGINT(255) DEFAULT NULL, rewards_claimed BOOLEAN NOT NULL DEFAULT FALSE)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_pets (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, description TEXT, rarity VARCHAR(20) NOT NULL DEFAULT 'common', base_price INT NOT NULL DEFAULT 500, strength_bonus INT NOT NULL DEFAULT 0, defense_bonus INT NOT NULL DEFAULT 0, agility_bonus INT NOT NULL DEFAULT 0, intelligence_bonus INT NOT NULL DEFAULT 0, luck_bonus INT NOT NULL DEFAULT 0, special_ability VARCHAR(100) DEFAULT NULL, emoji VARCHAR(20) DEFAULT '🐾')");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_character_pets (id INT PRIMARY KEY AUTO_INCREMENT, character_id INT NOT NULL, pet_id INT NOT NULL, name VARCHAR(50) NOT NULL, level INT NOT NULL DEFAULT 1, experience INT NOT NULL DEFAULT 0, happiness INT NOT NULL DEFAULT 100, is_active BOOLEAN NOT NULL DEFAULT FALSE, acquired_at BIGINT(255) NOT NULL, last_fed BIGINT(255) DEFAULT NULL)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_crafting_materials (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, description TEXT, rarity VARCHAR(20) NOT NULL DEFAULT 'common', stack_size INT NOT NULL DEFAULT 999, drop_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00, emoji VARCHAR(20) DEFAULT '⚙️')");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_crafting_recipes (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, result_item_id INT NOT NULL, required_level INT NOT NULL DEFAULT 1, material_1_id INT DEFAULT NULL, material_1_qty INT DEFAULT NULL, material_2_id INT DEFAULT NULL, material_2_qty INT DEFAULT NULL, material_3_id INT DEFAULT NULL, material_3_qty INT DEFAULT NULL, gold_cost INT NOT NULL DEFAULT 0, success_rate DECIMAL(5,2) NOT NULL DEFAULT 100.00)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_character_materials (character_id INT NOT NULL, material_id INT NOT NULL, quantity INT NOT NULL DEFAULT 0, PRIMARY KEY (character_id, material_id))");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_market_listings (id INT PRIMARY KEY AUTO_INCREMENT, seller_id INT NOT NULL, item_id INT NOT NULL, quantity INT NOT NULL DEFAULT 1, price_per_unit INT NOT NULL, listed_at BIGINT(255) NOT NULL, expires_at BIGINT(255) NOT NULL, sold BOOLEAN NOT NULL DEFAULT FALSE)");
    
    db.query("CREATE TABLE IF NOT EXISTS rpg_boss_encounters (id INT PRIMARY KEY AUTO_INCREMENT, boss_name VARCHAR(50) NOT NULL, boss_hp INT NOT NULL, boss_atk INT NOT NULL, boss_def INT NOT NULL, reward_multiplier DECIMAL(3,2) NOT NULL DEFAULT 2.00, spawn_chance DECIMAL(5,2) NOT NULL DEFAULT 5.00, emoji VARCHAR(20) DEFAULT '👑')");
    
    Log.info("Database tables ensured", { component: "Database" });
};