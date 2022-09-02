import { EmbedBuilder, Message, hyperlink } from "discord.js";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";
export default {
    data: {
        name: "help",
        aliases: ["ayuda", "ajuda"],
        requiredGuildPermissions: [],
        guildOnly: false,
        description: "Comando de ayuda."
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const texts = {
            embed: {
                title: "Sobre BarnieBot",
                description: `BarnieBot es un bot open source bajo la licencia de Apache 2 la cual se recomienda leer antes de cualquier uso del código de BarnieBot en el repositorio oficial.\nBarnieBot está enfocado en el multiuso, lo que quiere decir que está pensado para incluir funciones de todo tipo. BarnieBot se encuentra en fase beta por su reciente paso a la versión 3.0 la cuál está en proceso aún y traerá nuevas cosas pero descartará algunas cosas viejas que ya no son requeridas en la nueva versión, sin embargo, muchas otras funciones regreserán  mejoradas.\n\nRecuerda: Puedes ver datos del bot con el comando ${prefix}botinfo y los comandos con ${prefix}commands`,
                footer: "Barnie Corps © 2020 - 2025 All rights reserved."
            }
        }
        await utils.parallel({
            title: async (callback: any) => {
                if (lang !== "es") {
                    texts.embed.title = (await utils.translate(texts.embed.title, "es", lang)).text;
                }
                callback(null, true);
            },
            description: async (callback: any) => {
                if (lang !== "es") {
                    texts.embed.description = (await utils.translate(texts.embed.description, "es", lang)).text;
                }
                callback(null, true);
            }
        });
        const embed = new EmbedBuilder()
            .setAuthor({ iconURL: message.author.displayAvatarURL(), name: message.author.tag })
            .setTitle(texts.embed.title)
            .setDescription(`${texts.embed.description}`)
            .setFooter({ text: texts.embed.footer })
            .setTimestamp()
            .setColor("Purple")
        await reply({ embeds: [embed] } as unknown as string);
    }
}