import Log from "../Log";
import db from "./database";
export default function queries(): void {
    db.query("CREATE TABLE IF NOT EXISTS global_warnings (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, userid VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt INT(255) NOT NULL)");
    db.query("CREATE TABLE IF NOT EXISTS languages (userid VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'en')");
    db.query("CREATE TABLE IF NOT EXISTS discord_users (id VARCHAR(255) NOT NULL, pfp VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL DEFAULT 'Unknown User', command_executions INT(255) NOT NULL DEFAULT 1)");
    db.query("CREATE TABLE IF NOT EXISTS executed_commands (command VARCHAR(255) NOT NULL, uid VARCHAR(255) NOT NULL DEFAULT 0, at INT(255) NOT NULL DEFAULT 0, is_last BOOLEAN NOT NULL DEFAULT TRUE)");
    db.query("CREATE TABLE IF NOT EXISTS globalchats (guild VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, banned BOOLEAN NOT NULL DEFAULT FALSE, autotranslate BOOLEAN NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es', webhook_token VARCHAR(255) NOT NULL, webhook_id VARCHAR(255) NOT NULL)");
    db.query("CREATE TABLE IF NOT EXISTS global_messages (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, uid VARCHAR(255) NOT NULL, content TEXT NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'es')");
    db.query("CREATE TABLE IF NOT EXISTS guilds (id VARCHAR(255) NOT NULL, name VARCHAR(255) NOT NULL, member_count INT(255) NOT NULL DEFAULT 2, is_in BOOLEAN NOT NULL DEFAULT TRUE)");
    db.query("CREATE TABLE IF NOT EXISTS global_bans (id VARCHAR(255) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, times INT(255) NOT NULL DEFAULT 1)");
    db.query("CREATE TABLE IF NOT EXISTS filter_configs (guild VARCHAR(255) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, log_channel VARCHAR(255) NOT NULL DEFAULT '0', enabled_logs BOOLEAN NOT NULL DEFAULT FALSE, lang VARCHAR(2) NOT NULL DEFAULT 'en')");
    db.query("CREATE TABLE IF NOT EXISTS filter_words (id INT(255) NOT NULL PRIMARY KEY AUTO_INCREMENT, guild VARCHAR(255), content VARCHAR(255) NOT NULL DEFAULT '', protected BOOLEAN NOT NULL DEFAULT FALSE)");
    db.query("CREATE TABLE IF NOT EXISTS filter_webhooks (id VARCHAR(255) NOT NULL, token VARCHAR(255) NOT NULL, channel VARCHAR(255) NOT NULL)");
    db.query("CREATE TABLE IF NOT EXISTS vip_users (id VARCHAR(255) NOT NULL, start_date INT (255) NOT NULL, end_date INT (255) NOT NULL)");
};