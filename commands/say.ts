import { Message } from "discord.js";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";

export default {
    data: {
        name: "say",
        description: "Hace que el bot envíe un mensaje designado.",
        guildOnly: true,
        requiredGuildPermissions: ["ManageMessages"],
        aliases: ["decir"],
        category: "utility"
    },
    execute: async (message: Message<true>, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const input = args.slice(0).join(" ");
        if (!input) return reply("```\n" + `${prefix}say <...input>\n${utils.createSpaces(`${prefix}say `.length)}${utils.createArrows("<...input>".length)}\n\nERR: Missing required argument.` + "\n```");
        else {
            if (!message.deletable) return reply("```\n" + `${prefix}say <...input>\n${utils.createSpaces(`${prefix}say `.length)}${utils.createArrows("<...input>".length)}\n\nERR: Unable to delete author's message, do i have permissions?` + "\n```");
            await message.delete();
            await message.channel.send(input);
        }
    }
}