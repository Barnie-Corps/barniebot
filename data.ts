import { Collection } from "discord.js";
import { DataType } from "./types/interfaces";
const data: DataType = {
    database: {
        host: String(process.env.DB_HOST),
        user: String(process.env.DB_USER),
        password: String(process.env.DB_PASSWORD),
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
        log_channel: "795453591212261461",
        home_guild: "772817759612174337",
        support_category: "1438707166159568991",
        transcripts_channel: "1438709707874373632"
    }
}
export default data;