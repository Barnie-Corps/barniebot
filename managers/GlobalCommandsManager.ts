import { Message } from "discord.js";
import utils from "../utils";
import Log from "../Log";

interface GlobalCommand {
    trigger: string;
    requiresLanguage: boolean;
    defaultLanguage: string;
    content: {
        [key: string]: string;
    };
}

export default class GlobalCommandsManager {
    private commands: Map<string, GlobalCommand> = new Map();

    constructor() {
        this.loadCommands();
    }

    private loadCommands() {
        // Rules command with multi-language support
        this.commands.set("rules", {
            trigger: "rules",
            requiresLanguage: true,
            defaultLanguage: "en",
            content: {
                en: `**📜 Global Chat Rules**

1️⃣ **Be Respectful**: Treat all members with respect. No harassment, hate speech, or discrimination.

2️⃣ **No Spam**: Don't flood the chat with repeated messages, excessive caps, or unwanted content.

3️⃣ **Keep It Clean**: No NSFW content, gore, or disturbing material. This is a family-friendly space.

4️⃣ **No Self-Promotion**: Don't advertise servers, products, or social media without permission.

5️⃣ **Use Common Sense**: If something feels wrong, it probably is. Follow Discord's Terms of Service.

6️⃣ **No Doxxing**: Never share personal information about yourself or others.

7️⃣ **English in Global**: While translations are provided, try to keep primary messages understandable.

8️⃣ **No Raids or Brigading**: Don't coordinate attacks on other servers or users.

9️⃣ **Respect Staff**: Follow staff instructions. Don't argue with moderation decisions in public.

🔟 **No Impersonation**: Don't pretend to be staff members or other users.

⚠️ **Violations may result in warnings, mutes, or permanent bans from the global chat.**

*This global chat connects multiple Discord servers. Your messages are relayed across all connected guilds.*`,
                es: `**📜 Reglas del Chat Global**

1️⃣ **Sé Respetuoso**: Trata a todos los miembros con respeto. No acoso, discursos de odio o discriminación.

2️⃣ **No Spam**: No inundes el chat con mensajes repetidos, mayúsculas excesivas o contenido no deseado.

3️⃣ **Mantén la Limpieza**: No contenido NSFW, gore o material perturbador. Este es un espacio familiar.

4️⃣ **No Auto-Promoción**: No publicites servidores, productos o redes sociales sin permiso.

5️⃣ **Usa el Sentido Común**: Si algo se siente mal, probablemente lo sea. Sigue los Términos de Servicio de Discord.

6️⃣ **No Doxxing**: Nunca compartas información personal tuya o de otros.

7️⃣ **Inglés en Global**: Aunque se proporcionan traducciones, intenta mantener los mensajes principales comprensibles.

8️⃣ **No Raids o Brigadas**: No coordines ataques contra otros servidores o usuarios.

9️⃣ **Respeta al Staff**: Sigue las instrucciones del personal. No discutas decisiones de moderación en público.

🔟 **No Suplantación**: No finjas ser miembros del personal u otros usuarios.

⚠️ **Las violaciones pueden resultar en advertencias, silenciamientos o prohibiciones permanentes del chat global.**

*Este chat global conecta múltiples servidores de Discord. Tus mensajes se transmiten a todos los servidores conectados.*`,
                fr: `**📜 Règles du Chat Global**

1️⃣ **Soyez Respectueux**: Traitez tous les membres avec respect. Pas de harcèlement, discours haineux ou discrimination.

2️⃣ **Pas de Spam**: Ne submergez pas le chat avec des messages répétés, des majuscules excessives ou du contenu indésirable.

3️⃣ **Restez Propre**: Pas de contenu NSFW, gore ou matériel dérangeant. C'est un espace familial.

4️⃣ **Pas d'Auto-Promotion**: Ne faites pas la publicité de serveurs, produits ou réseaux sociaux sans permission.

5️⃣ **Utilisez le Bon Sens**: Si quelque chose semble mal, c'est probablement le cas. Suivez les Conditions d'Utilisation de Discord.

6️⃣ **Pas de Doxxing**: Ne partagez jamais d'informations personnelles sur vous ou les autres.

7️⃣ **Anglais en Global**: Bien que des traductions soient fournies, essayez de garder les messages principaux compréhensibles.

8️⃣ **Pas de Raids ou Brigades**: Ne coordonnez pas d'attaques contre d'autres serveurs ou utilisateurs.

9️⃣ **Respectez le Staff**: Suivez les instructions du personnel. Ne discutez pas les décisions de modération en public.

🔟 **Pas d'Usurpation**: Ne prétendez pas être des membres du personnel ou d'autres utilisateurs.

⚠️ **Les violations peuvent entraîner des avertissements, des silences ou des interdictions permanentes du chat global.**

*Ce chat global connecte plusieurs serveurs Discord. Vos messages sont relayés à tous les serveurs connectés.*`,
                de: `**📜 Globale Chat-Regeln**

1️⃣ **Sei Respektvoll**: Behandle alle Mitglieder mit Respekt. Keine Belästigung, Hassreden oder Diskriminierung.

2️⃣ **Kein Spam**: Überflute den Chat nicht mit wiederholten Nachrichten, übermäßigen Großbuchstaben oder unerwünschten Inhalten.

3️⃣ **Halte es Sauber**: Kein NSFW-Inhalt, Gore oder verstörendes Material. Dies ist ein familienfreundlicher Raum.

4️⃣ **Keine Eigenwerbung**: Bewirb keine Server, Produkte oder soziale Medien ohne Erlaubnis.

5️⃣ **Nutze den Gesunden Menschenverstand**: Wenn sich etwas falsch anfühlt, ist es das wahrscheinlich. Befolge die Nutzungsbedingungen von Discord.

6️⃣ **Kein Doxxing**: Teile niemals persönliche Informationen über dich oder andere.

7️⃣ **Englisch im Globalen Chat**: Obwohl Übersetzungen bereitgestellt werden, versuche Hauptnachrichten verständlich zu halten.

8️⃣ **Keine Raids oder Brigaden**: Koordiniere keine Angriffe auf andere Server oder Benutzer.

9️⃣ **Respektiere das Team**: Befolge die Anweisungen des Personals. Diskutiere nicht öffentlich über Moderationsentscheidungen.

🔟 **Keine Nachahmung**: Gib dich nicht als Teammitglieder oder andere Benutzer aus.

⚠️ **Verstöße können zu Verwarnungen, Stummschaltungen oder permanenten Verboten aus dem globalen Chat führen.**

*Dieser globale Chat verbindet mehrere Discord-Server. Deine Nachrichten werden an alle verbundenen Gilden weitergeleitet.*`,
                pt: `**📜 Regras do Chat Global**

1️⃣ **Seja Respeitoso**: Trate todos os membros com respeito. Sem assédio, discurso de ódio ou discriminação.

2️⃣ **Sem Spam**: Não inunde o chat com mensagens repetidas, letras maiúsculas excessivas ou conteúdo indesejado.

3️⃣ **Mantenha Limpo**: Sem conteúdo NSFW, gore ou material perturbador. Este é um espaço familiar.

4️⃣ **Sem Auto-Promoção**: Não anuncie servidores, produtos ou mídias sociais sem permissão.

5️⃣ **Use o Bom Senso**: Se algo parece errado, provavelmente é. Siga os Termos de Serviço do Discord.

6️⃣ **Sem Doxxing**: Nunca compartilhe informações pessoais sobre você ou outros.

7️⃣ **Inglês no Global**: Embora traduções sejam fornecidas, tente manter as mensagens principais compreensíveis.

8️⃣ **Sem Raids ou Brigadas**: Não coordene ataques contra outros servidores ou usuários.

9️⃣ **Respeite a Equipe**: Siga as instruções da equipe. Não discuta decisões de moderação publicamente.

🔟 **Sem Personificação**: Não finja ser membros da equipe ou outros usuários.

⚠️ **Violações podem resultar em avisos, silenciamentos ou banimentos permanentes do chat global.**

*Este chat global conecta múltiplos servidores do Discord. Suas mensagens são transmitidas para todos os servidores conectados.*`
            }
        });

        // Help command
        this.commands.set("help", {
            trigger: "help",
            requiresLanguage: false,
            defaultLanguage: "en",
            content: {
                en: `**🤖 Global Chat Commands**

\`b.rules [language]\` - View global chat rules
\`b.help\` - Show this help message

**Available Languages for Rules:**
\`en\` - English
\`es\` - Spanish (Español)
\`fr\` - French (Français)
\`de\` - German (Deutsch)
\`pt\` - Portuguese (Português)

**Example:** \`b.rules es\` for Spanish rules

*This is a global chat connecting multiple Discord servers. Your messages are automatically translated and sent across all connected guilds.*`
            }
        });

        Log.info("Global commands loaded", { 
            component: "GlobalCommandsManager",
            commandCount: this.commands.size 
        });
    }

    public async processMessage(message: Message, manager: any): Promise<boolean> {
        const content = message.content.trim();
        
        // Check if message starts with b. prefix
        if (!content.toLowerCase().startsWith("b.")) return false;

        const [rawCommand, ...args] = content.slice(2).trim().split(/\s+/);
        const command = rawCommand.toLowerCase();

        const globalCommand = this.commands.get(command);
        if (!globalCommand) return false;

        // Determine language
        let targetLanguage = globalCommand.defaultLanguage;
        
        if (globalCommand.requiresLanguage && args.length > 0) {
            const requestedLang = args[0].toLowerCase();
            if (globalCommand.content[requestedLang]) {
                targetLanguage = requestedLang;
            }
        }

        // Get content for the language
        const content_to_send = globalCommand.content[targetLanguage] || 
                                globalCommand.content[globalCommand.defaultLanguage];

        // Send via ChatManager's announce method
        try {
            await manager.announce(content_to_send, targetLanguage);
            
            Log.info("Global command executed", {
                component: "GlobalCommandsManager",
                command: globalCommand.trigger,
                language: targetLanguage,
                userId: message.author.id,
                username: message.author.username
            });

            return true;
        } catch (error: any) {
            Log.error("Failed to execute global command", new Error(
                `Command: ${globalCommand.trigger}, Language: ${targetLanguage}, Error: ${error.message}`
            ));
            return false;
        }
    }

    public getCommand(name: string): GlobalCommand | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): string[] {
        return Array.from(this.commands.keys());
    }
}
