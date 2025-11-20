import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import * as fs from "fs";
import * as path from "path";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("gethtml")
        .setDescription("Gets the HTML and code response from a given URL.")
        .addStringOption(o => o.setName("url").setRequired(true).setDescription("URL whose response code and html you wanna get")),
    category: "Utility",
    execute: async (interaction: ChatInputCommandInteraction, language: string) => {
        let texts = {
            code: "Response Code",
            invalid: "The URL provided is invalid or unreachable.",
            contentType: "Content-Type",
            contentLength: "Content-Length"
        };
        if (language !== "en") {
            texts = await utils.autoTranslate(texts, "en", language);
        }
        const rawUrl = interaction.options.getString("url") as string;
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(rawUrl);
        } catch {
            await utils.safeInteractionRespond(interaction, texts.invalid);
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response: globalThis.Response | undefined;
        try {
            response = await fetch(parsedUrl.toString(), { signal: controller.signal } as any);
        } catch {
            clearTimeout(timeout);
            await utils.safeInteractionRespond(interaction, texts.invalid);
            return;
        }
        clearTimeout(timeout);
        if (!response) {
            await utils.safeInteractionRespond(interaction, texts.invalid);
            return;
        }
        let html = await response.text();
        const systemIp = String(process.env.SYSTEM_IP || "");
        if (systemIp.length > 1) {
            html = (html as any).replaceAll(systemIp, "[SYSTEM IP CENSORED]");
        }
        const statusCode = response.status;
        const contentType = response.headers.get("content-type") || "unknown";
        const contentLength = response.headers.get("content-length") || "unknown";
        const tmpPath = path.join(process.cwd(), `response-${Date.now()}.html`);
        fs.writeFileSync(tmpPath, html, "utf-8");
        const embed = new EmbedBuilder()
            .setTitle("GET HTML")
            .addFields(
                { name: "URL", value: parsedUrl.toString() },
                { name: texts.code, value: String(statusCode), inline: true },
                { name: texts.contentType, value: contentType, inline: true },
                { name: texts.contentLength, value: String(contentLength), inline: true }
            )
            .setTimestamp(new Date());
        try {
            await utils.safeInteractionRespond(interaction, { embeds: [embed], files: [tmpPath] });
        } finally {
            try { fs.unlinkSync(tmpPath); } catch { }
        }
    }
}