import { Collection, Message } from "discord.js";
export interface DataType {
    database: {
        host: string;
        user: string;
        password: string;
        port?: number;
        database: string;
    };
    bot: {
        owners: string[];
        emojis: BotEmoji[];
        token: string;
        commands: Collection<string, any>
    }
}
export interface BotEmoji {
    emoji: string;
    name: string;
    id: string;
}
export interface ReplyFunction {
    (content: string): Promise<Message<boolean>>
}