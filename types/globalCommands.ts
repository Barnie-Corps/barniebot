import { Message } from "discord.js";

export interface GlobalCommand {
    trigger: string;
    defaultLanguage: string;
    description: string;
    usage: string;
    content?: string;
    dmOnly?: boolean;
    handler?: (message: Message, args: string[]) => Promise<string>;
}
