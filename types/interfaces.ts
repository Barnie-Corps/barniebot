import { Collection, Message, MessagePayload } from "discord.js";
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
        commands: Collection<string, any>;
        encryption_key: string;
        log_channel: string;
    }
}
export interface BotEmoji {
    emoji: string;
    name: string;
    id: string;
}

export interface ChatManagerOptions {
    ratelimit_time: number;
    messages_limit: number;
    time: number
}