import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import data from "../data";
import utils from "../utils";

// Category emojis for visual appeal
const CATEGORY_EMOJIS: Record<string, string> = {
    "Utility": "🛠️",
    "AI": "🤖",
    "Moderation": "🛡️",
    "Bot Staff": "👥",
    "Info": "ℹ️",
    "Admin": "⚙️",
    "Support": "🎫",
    "Fun": "🎉"
};

// Category descriptions
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    "Utility": "General utility commands for everyday use",
    "AI": "AI-powered features and interactions",
    "Moderation": "Moderation and management tools",
    "Bot Staff": "Bot staff management and global moderation",
    "Info": "Information and statistics commands",
    "Admin": "Bot administration commands",
    "Support": "Support ticket system",
    "Fun": "Entertainment and fun commands"
};

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Shows all available commands with categories and pagination")
        .addStringOption(option =>
            option
                .setName("category")
                .setDescription("Filter commands by category")
                .setRequired(false)
                .addChoices(
                    { name: "🛠️ Utility", value: "Utility" },
                    { name: "🤖 AI", value: "AI" },
                    { name: "🛡️ Moderation", value: "Moderation" },
                    { name: "👥 Bot Staff", value: "Bot Staff" },
                    { name: "ℹ️ Info", value: "Info" },
                    { name: "⚙️ Admin", value: "Admin" },
                    { name: "🎫 Support", value: "Support" },
                    { name: "🎉 Fun", value: "Fun" }
                )
        )
        .addStringOption(option =>
            option
                .setName("command")
                .setDescription("Get detailed info about a specific command")
                .setRequired(false)
        ),
    category: "Info",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        const specificCommand = interaction.options.getString("command");
        const selectedCategory = interaction.options.getString("category");

        // If a specific command is requested
        if (specificCommand) {
            const cmd = data.bot.commands.get(specificCommand.toLowerCase());
            if (!cmd) {
                return await interaction.editReply(`❌ Command \`${specificCommand}\` not found.`);
            }

            let texts = {
                title: "Command Details",
                name: "Name",
                description: "Description",
                category: "Category",
                usage: "Usage",
                ephemeral: "Ephemeral",
                yes: "Yes",
                no: "No"
            };

            if (lang !== "en") {
                texts = await utils.autoTranslate(texts, "en", lang);
            }

            // Translate only the command description
            let translatedDescription = cmd.data.description;
            if (lang !== "en") {
                try {
                    translatedDescription = (await utils.translate(cmd.data.description, "en", lang)).text;
                } catch (error) {
                    // If translation fails, use original
                    translatedDescription = cmd.data.description;
                }
            }

            const detailEmbed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle(`${CATEGORY_EMOJIS[cmd.category] || "📋"} ${texts.title}: /${cmd.data.name}`)
                .addFields(
                    { name: texts.name, value: `\`/${cmd.data.name}\``, inline: true },
                    { name: texts.category, value: `${CATEGORY_EMOJIS[cmd.category] || "📋"} ${cmd.category}`, inline: true },
                    { name: texts.ephemeral, value: cmd.ephemeral ? texts.yes : texts.no, inline: true },
                    { name: texts.description, value: translatedDescription, inline: false }
                )
                .setFooter({ text: `${cmd.data.name} • Use /${cmd.data.name} to execute` })
                .setTimestamp();

            return await interaction.editReply({ embeds: [detailEmbed], content: "" });
        }

        // Get all commands and organize by category
        const commandsByCategory: Record<string, any[]> = {};

        for (const [name, cmd] of data.bot.commands) {
            const category = cmd.category || "Uncategorized";
            if (!commandsByCategory[category]) {
                commandsByCategory[category] = [];
            }
            commandsByCategory[category].push(cmd);
        }

        // Sort categories and commands
        const sortedCategories = Object.keys(commandsByCategory).sort();
        for (const category of sortedCategories) {
            commandsByCategory[category].sort((a, b) => a.data.name.localeCompare(b.data.name));
        }

        // Filter by category if specified
        const categoriesToShow = selectedCategory ? [selectedCategory] : sortedCategories;
        const COMMANDS_PER_PAGE = 8;

        // Collect all commands to show
        let allCommands: Array<{ cmd: any; category: string }> = [];
        for (const category of categoriesToShow) {
            if (commandsByCategory[category]) {
                for (const cmd of commandsByCategory[category]) {
                    allCommands.push({ cmd, category });
                }
            }
        }

        if (allCommands.length === 0) {
            return await interaction.editReply("No commands found in this category.");
        }

        const totalPages = Math.ceil(allCommands.length / COMMANDS_PER_PAGE);
        let currentPage = 0;

        // Texts for translation
        let texts = {
            title: "Command Help",
            description: "Browse all available commands by category",
            page: "Page",
            of: "of",
            totalCommands: "Total Commands",
            category: "Category",
            commands: "Commands",
            filterBy: "Filter by category",
            viewDetails: "Use /help command:<name> for details",
            categoryAll: "All Categories"
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const generateEmbed = async (page: number) => {
            const start = page * COMMANDS_PER_PAGE;
            const end = Math.min(start + COMMANDS_PER_PAGE, allCommands.length);
            const pageCommands = allCommands.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle(`📚 ${texts.title}`)
                .setDescription(selectedCategory 
                    ? `${CATEGORY_EMOJIS[selectedCategory] || "📋"} **${selectedCategory}**\n${CATEGORY_DESCRIPTIONS[selectedCategory] || ""}\n\n${texts.viewDetails}`
                    : `${texts.description}\n\n${texts.viewDetails}`)
                .setFooter({ text: `${texts.page} ${page + 1} ${texts.of} ${totalPages} • ${texts.totalCommands}: ${allCommands.length}` })
                .setTimestamp();

            // Group commands by category for this page
            const pageCategories: Record<string, any[]> = {};
            for (const { cmd, category } of pageCommands) {
                if (!pageCategories[category]) {
                    pageCategories[category] = [];
                }
                pageCategories[category].push(cmd);
            }

            // Add fields for each category on this page
            for (const [category, cmds] of Object.entries(pageCategories)) {
                const emoji = CATEGORY_EMOJIS[category] || "📋";
                
                // Translate only descriptions
                const commandList = [];
                for (const cmd of cmds) {
                    let translatedDesc = cmd.data.description;
                    if (lang !== "en") {
                        try {
                            translatedDesc = (await utils.translate(cmd.data.description, "en", lang)).text;
                        } catch (error) {
                            translatedDesc = cmd.data.description;
                        }
                    }
                    commandList.push(`\`/${cmd.data.name}\` - ${translatedDesc}`);
                }

                embed.addFields({
                    name: `${emoji} ${category}`,
                    value: commandList.join("\n") || "No commands",
                    inline: false
                });
            }

            return embed;
        };

        const generateComponents = (page: number) => {
            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("help_first")
                    .setLabel("⏮️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId("help_prev")
                    .setLabel("◀️")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId("help_page")
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId("help_next")
                    .setLabel("▶️")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId("help_last")
                    .setLabel("⏭️")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1)
            );

            // Category filter dropdown
            const categoryOptions = [
                new StringSelectMenuOptionBuilder()
                    .setLabel(texts.categoryAll)
                    .setValue("all")
                    .setDescription("Show all commands")
                    .setDefault(!selectedCategory)
            ];

            for (const category of sortedCategories) {
                const emoji = CATEGORY_EMOJIS[category] || "📋";
                categoryOptions.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${emoji} ${category}`)
                        .setValue(category)
                        .setDescription(CATEGORY_DESCRIPTIONS[category] || category)
                        .setDefault(selectedCategory === category)
                );
            }

            const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("help_category_filter")
                    .setPlaceholder(texts.filterBy)
                    .addOptions(categoryOptions)
            );

            return [row1, row2];
        };

        const embed = await generateEmbed(currentPage);
        const components = generateComponents(currentPage);

        const response = await interaction.editReply({
            embeds: [embed],
            components: components
        });

        // Create collector for button interactions
        const collector = response.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 300000 // 5 minutes
        });

        collector.on("collect", async (i) => {
            if (i.customId === "help_first") {
                currentPage = 0;
            } else if (i.customId === "help_prev") {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === "help_next") {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            } else if (i.customId === "help_last") {
                currentPage = totalPages - 1;
            } else if (i.customId === "help_category_filter" && i.isStringSelectMenu()) {
                const selectedValue = i.values[0];
                
                // Rebuild command list based on selection
                allCommands = [];
                const filterCategories = selectedValue === "all" ? sortedCategories : [selectedValue];
                
                for (const category of filterCategories) {
                    if (commandsByCategory[category]) {
                        for (const cmd of commandsByCategory[category]) {
                            allCommands.push({ cmd, category });
                        }
                    }
                }

                currentPage = 0;
            }

            const newEmbed = await generateEmbed(currentPage);
            const newComponents = generateComponents(currentPage);

            await i.update({
                embeds: [newEmbed],
                components: newComponents
            });
        });

        collector.on("end", async () => {
            try {
                // Disable all components when collector expires
                const disabledComponents = components.map(row => {
                    const newRow = ActionRowBuilder.from(row as any);
                    newRow.components.forEach((component: any) => {
                        if (component.setDisabled) component.setDisabled(true);
                    });
                    return newRow;
                });

                await interaction.editReply({ components: disabledComponents as any });
            } catch (error) {
                // Ignore errors if message was already deleted
            }
        });
    },
    ephemeral: false
};
