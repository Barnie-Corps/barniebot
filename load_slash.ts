import { REST, Routes } from "discord.js";
import data from "./data";
import Log from "./Log";

export default async function load_slash() {
    const rawCommands = [];

    for (const cmd of data.bot.commands.values()) {
        rawCommands.push(cmd.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(data.bot.token);
    Log.info("Refreshing global application commands...", { component: "CommandLoader" });
    const loaded = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_BOT_ID as string),
        {
            body: rawCommands
        }
    );
    Log.success("Global application commands refreshed", { component: "CommandLoader", commandCount: rawCommands.length });
}