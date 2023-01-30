import Log from "../Log";
import db from "./database";
export default function queries(): void {
    db.query("CREATE TABLE IF NOT EXISTS warnings (id INT NOT NULL PRIMARY KEY AUTO_INCREMENT, userid VARCHAR(255) NOT NULL, reason VARCHAR(255) NOT NULL DEFAULT 'no reason', authorid VARCHAR(255) NOT NULL, createdAt INT(255) NOT NULL)");
    db.query("CREATE TABLE IF NOT EXISTS languages (userid VARCHAR(255) NOT NULL, lang VARCHAR(5) NOT NULL DEFAULT 'en')");
};