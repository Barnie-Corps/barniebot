import { Collection } from "discord.js";
import { DataType } from "./types/interfaces";
const data: DataType = {
    database: {
        host: String(process.env.DB_HOST),
        user: String(process.env.DB_USER),
        password: String(process.env.DB_PASSWORD),
        port: (() => {
            const p = Number(process.env.DB_PORT);
            return Number.isFinite(p) && p > 0 ? p : undefined;
        })(),
        database: String(process.env.DB_NAME),
        charset: "utf8mb4"
    },
    bot: {
        owners: [],
        emojis: [{
            name: "thumbsup",
            id: "thumbsup",
            emoji: "👍"
        },
        {
            name: "thumbsdown",
            id: "thumbsdown",
            emoji: "👎"
        }],
        loadingEmoji: {
            id: "875107406462472212",
            mention: "<a:discordproloading:875107406462472212>",
            name: "discordproloading"
        },
        token: String(process.env.TOKEN),
        commands: new Collection(),
        encryption_key: String(process.env.ENCRYPTION_KEY),
        log_channel: "1473484431544156376",
        home_guild: "892262207625256961",
        support_category: "1473483598291271752",
        transcripts_channel: "1473484653762445505",
        bug_reports_channel: "1473484349314957567",
        staff_ranks: [],
        default_staff_ranks: [
            "Trial Support",
            "Support",
            "Intern",
            "Trial Moderator",
            "Moderator",
            "Senior Moderator",
            "Chief of Moderation",
            "Probationary Administrator",
            "Administrator",
            "Head Administrator",
            "Chief of Staff",
            "Co-Owner",
            "Owner"
        ]
    }
}
export default data;
