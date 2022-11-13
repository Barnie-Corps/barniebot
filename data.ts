import { Collection } from "discord.js";
import { DataType } from "./types/interfaces";
const data: DataType = {
    database: {
        host: String(process.env.DB_HOST),
        user: String(process.env.DB_USER),
        password: String(process.env.DB_PASSWORD),
        database: String(process.env.DB_NAME)
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
        token: String(process.env.TOKEN),
        commands: new Collection()
    }
}
export default data;