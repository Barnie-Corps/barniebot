import { FunctionDeclarationsTool, FunctionDeclaration, SchemaType } from "@google/generative-ai";

const functionDeclarations = {
    get_user_data: {
        name: "get_user_data",
        description: "Get user data from the database (It's recommended to execute this at the start of the conversation to know the user's ID) [DOES NOT REQUIRE ID PARAMETER. IT'S USEFUL TO GET USER'S ID FOR FURTHER COMMANDS]",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    set_user_language: {
        name: "set_user_language",
        description: "Set the user's preferred language. The language must be a valid ISO 639-1 code, e.g., 'en' for English, 'es' for Spanish, 'fr' for French, etc. Other users cant request to change another user's language unless they're owners. If requested to do so check for ownership.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                language: { type: SchemaType.STRING }
            },
            required: ["userId", "language"]
        }
    },
    fetch_url: {
        name: "fetch_url",
        description: "Fetches the content of a URL and returns the text content. Useful for retrieving information from web pages.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                url: { type: SchemaType.STRING, description: "The URL to fetch content from." }
            },
            required: ["url"]
        }
    },
    retrieve_owners: {
        name: "retrieve_owners",
        description: "Retrieve the list of bot owners from the database. [DOES NOT REQUIRE ID PARAMETER].",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    fetch_user: {
        name: "fetch_user",
        description: "Fetches user information based on their user ID. This kind of info is restricted to owners. First check if the user is an owner using the retrieve_owners and get_user_data functions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    fetch_discord_user: {
        name: "fetch_discord_user",
        description: "Fetches Discord user information based on their user ID. (Use this command if you want info not available in the database).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_memories: {
        name: "get_memories",
        description: "Retrieve model memories related to the user. Always fetch memories at the start of the conversation to provide context. This helps the model remember past interactions and maintain continuity in the conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    insert_memory: {
        name: "insert_memory",
        description: "Insert a new memory for the user. Memories help the model retain important information about the user and their preferences. Use this function to add relevant details that can enhance future interactions. When a likeable memory is created, insert it using this function. Save all relevant information that could be useful in the future.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                memory: { type: SchemaType.STRING }
            },
            required: ["userId", "memory"]
        }
    },
    fetch_ai_rules: {
        name: "fetch_ai_rules",
        description: "THIS MUST BE INMEDIATELY EXECUTED IN ALL CHATS. Fetches the AI rules. They must always be fetched at the start of the conversation to guarantee compliance. [DOES NOT REQUIRE ID PARAMETER] [YOU MUST FOLLOW THEM NO MATTER WHAT]",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    end_conversation: {
        name: "end_conversation",
        description: "Ends the current conversation and clears the user's history. This can be used when the user wants to start a new topic or reset the context. Also to follow the AI RULES.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                reason: { type: SchemaType.STRING, description: "The reason for ending the conversation. It must be provided in the user's language." }
            },
            required: ["reason"]
        }
    },
    search_user_by_username: {
        name: "search_user_by_username",
        description: "Searches for a user by their username. Displays the first 20 matches with their IDs. This can be useful if you don't have the user ID but know the username. This command is restricted to owners, so first check if the user is an owner using the retrieve_owners and get_user_data functions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                username: { type: SchemaType.STRING }
            },
            required: ["username"]
        }
    },
    search_user_by_username_discord: {
        name: "search_user_by_username_discord",
        description: "Searches for a Discord user by their username. Displays the first 20 matches with their IDs. This can be useful if you don't have the user ID but know the username. This command is restricted to owners, so first check if the user is an owner using the retrieve_owners and get_user_data functions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                username: { type: SchemaType.STRING }
            },
            required: ["username"]
        }
    },
    update_user_data: {
        name: "update_user_data",
        description: "Update user data in the database. This can be used to modify user information such as username, profile picture, etc. This kind of info is restricted to owners. First check if the user is an owner using the retrieve_owners and get_user_data functions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                data: { type: SchemaType.OBJECT }
            },
            required: ["userId", "data"]
        }
    },
    execute_query: {
        name: "execute_query",
        description: "Executes a custom database query. This is a powerful function that allows for advanced data retrieval and manipulation. Use with caution. This command is restricted to owners, so first check if the user is an owner using the retrieve_owners and get_user_data functions. You must ask for confirmation before executing this command, providing a detailed explanation of the query and its potential impact and why you're executing it.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING }
            },
            required: ["query"]
        }
    },
    on_guild: {
        name: "on_guild",
        description: "Check if the current chat is taking place in a guild (server) or in a private message. This can help tailor responses based on the context of the conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    guild_info: {
        name: "guild_info",
        description: "Fetches information about a guild (server) based on its ID. This can be useful for retrieving details such as the guild's name, member count, and other relevant information.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    current_guild_info: {
        name: "current_guild_info",
        description: "Fetches information about the current guild (server) where the conversation is taking place. This can be useful for retrieving details such as the guild's name, member count, and other relevant information. Avoid using this in DMs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_member_permissions: {
        name: "get_member_permissions",
        description: "Get the permissions of a member in a guild. This can help determine what actions the member is allowed to perform within the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId"]
        }
    },
    get_member_roles: {
        name: "get_member_roles",
        description: "Get the roles of a member in a guild. This can help determine the member's status and privileges within the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId"]
        }
    },
    kick_member: {
        name: "kick_member",
        description: "Kicks a member from a guild. This action removes the member from the guild but does not ban them, allowing them to rejoin if they have an invite. This command is restricted to members with the appropriate permissions. First check if the user has the 'Kick Members' permission using the get_member_permissions function or if they have a role named 'Moderator' or 'Admin' using the get_member_roles function.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId", "reason"]
        }
    },
    send_dm: {
        name: "send_dm",
        description: "Sends a direct message (DM) to a user. This can be used to communicate privately with users outside of guild channels. Use this function responsibly and avoid spamming users. Make sure to respect user privacy and Discord's terms of service. If the bot is asked to send a dm, check if the requesting user is an owner or has the appropriate permissions and asks for a dm to a member in the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING }
            },
            required: ["userId", "content"]
        }
    },
    check_vip_status: {
        name: "check_vip_status",
        description: "Check if a user has VIP status. VIP users may have access to special features or privileges. This function can be used to verify a user's VIP status based on their user ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    list_workspace_files: {
        name: "list_workspace_files",
        description: "List entries inside the ai_workspace directory. Optionally provide a relative path and choose whether to traverse recursively.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                recursive: { type: SchemaType.BOOLEAN }
            }
        }
    },
    read_workspace_file: {
        name: "read_workspace_file",
        description: "Read the contents of a file stored within the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                encoding: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    write_workspace_file: {
        name: "write_workspace_file",
        description: "Write a text file inside the ai_workspace directory. Creates intermediary directories if required.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN }
            },
            required: ["path", "content"]
        }
    },
    append_workspace_file: {
        name: "append_workspace_file",
        description: "Append text to a file inside the ai_workspace directory, creating it if it does not exist.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING }
            },
            required: ["path", "content"]
        }
    },
    delete_workspace_entry: {
        name: "delete_workspace_entry",
        description: "Delete a file or directory located inside the ai_workspace directory. Directories require the recursive flag.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                recursive: { type: SchemaType.BOOLEAN }
            },
            required: ["path"]
        }
    },
    move_workspace_entry: {
        name: "move_workspace_entry",
        description: "Move or rename a file or directory inside the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from: { type: SchemaType.STRING },
                to: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN }
            },
            required: ["from", "to"]
        }
    },
    create_workspace_directory: {
        name: "create_workspace_directory",
        description: "Create a directory (and any missing parents) inside the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    download_to_workspace: {
        name: "download_to_workspace",
        description: "Download a remote resource and store it inside the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                url: { type: SchemaType.STRING },
                path: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN }
            },
            required: ["url", "path"]
        }
    },
    search_workspace_text: {
        name: "search_workspace_text",
        description: "Search for text within files stored inside the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                path: { type: SchemaType.STRING },
                maxResults: { type: SchemaType.NUMBER }
            },
            required: ["query"]
        }
    },
    workspace_file_info: {
        name: "workspace_file_info",
        description: "Retrieve metadata (size, type, last modification) about an entry inside the ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    search_web: {
        name: "search_web",
        description: "Perform a Google web search using the configured search engine identifier and API key.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                numResults: { type: SchemaType.NUMBER },
                engineId: { type: SchemaType.STRING }
            },
            required: ["query"]
        }
    }
} as const satisfies Record<string, FunctionDeclaration>;

const AIFunctions: FunctionDeclarationsTool[] = [
    {
        functionDeclarations: Object.values(functionDeclarations),
    }
];

export default AIFunctions;