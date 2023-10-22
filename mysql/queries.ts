import Log from "../Log";
import db from "./database";
export default function queries(): void {
    db.query("CREATE TABLE IF NOT EXISTS global_warnings (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, userid VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt INT(255) NOT NULL)");
    db.query("CREATE TABLE IF NOT EXISTS languages (userid VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'en')");
    db.query("CREATE TABLE IF NOT EXISTS discord_users (id VARCHAR(255) NOT NULL, pfp VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL DEFAULT 'Unknown User', command_executions INT(255) NOT NULL DEFAULT 1)");
    db.query("CREATE TABLE IF NOT EXISTS executed_commands (command VARCHAR(255) NOT NULL, uid VARCHAR(255) NOT NULL DEFAULT 0, at INT(255) NOT NULL DEFAULT 0, is_last BOOLEAN NOT NULL DEFAULT TRUE)");
};