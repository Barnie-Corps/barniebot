export enum SchemaType {
    OBJECT = "object",
    STRING = "string",
    NUMBER = "number",
    INTEGER = "integer",
    BOOLEAN = "boolean",
    ARRAY = "array"
}

export type FunctionDeclaration = {
    name: string;
    description: string;
    parameters: {
        type: SchemaType;
        properties: Record<string, any>;
        required?: string[];
    };
};

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
    isOwner: {
        name: "isOwner",
        description: "Check if a user is an owner of the bot.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
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
    },
    attach_workspace_file: {
        name: "attach_workspace_file",
        description: "Attach a file from the ai_workspace directory to the current conversation, allowing the user to download it directly.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    execute_js_code: {
        name: "execute_js_code",
        description: "Executes a JavaScript code snippet in a secure sandboxed environment. The code has access to a limited set of libraries and functions to ensure safety. Use this function to perform calculations, data manipulations, or other tasks that can be accomplished with JavaScript. This command can interact with the AI file workspace. Never outside it.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                code: { type: SchemaType.STRING }
            },
            required: ["code"]
        }
    },
    execute_command: {
        name: "execute_command",
        description: "Executes a shell command in a secure sandboxed environment. The command has access to a limited set of tools and functions to ensure safety. Use this function to perform system-level tasks, file manipulations, or other operations that can be accomplished via shell commands. This command can interact with the AI file workspace. Never outside it.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                command: { type: SchemaType.STRING }
            },
            required: ["command"]
        }
    },
    remove_memories: {
        name: "remove_memories",
        description: "Removes all memories associated with the user. This can be used to clear the user's memory history and reset the context for future interactions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    remove_memory: {
        name: "remove_memory",
        description: "Removes a specific memory associated with the user. This can be used to delete a particular memory that is no longer relevant or needed.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                memoryId: { type: SchemaType.STRING }
            },
            required: ["userId", "memoryId"]
        }
    },
    send_email: {
        name: "send_email",
        description: "Sends an email to a specified recipient. This can be used to communicate important information or notifications via email. This function requires the recipient's email address, subject, and body content of the email which can be plain text or HTML. Be advised using this will not ensure the email is sent, it still requires athorization from the staff.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                to: { type: SchemaType.STRING },
                subject: { type: SchemaType.STRING },
                body: { type: SchemaType.STRING },
                isHtml: { type: SchemaType.BOOLEAN }
            },
            required: ["to", "subject", "body", "isHtml"]
        }
    },
    get_bot_statistics: {
        name: "get_bot_statistics",
        description: "Get comprehensive bot statistics including guild count, user count, memory usage, and database metrics. Owner-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    check_database_health: {
        name: "check_database_health",
        description: "Check the database connection health and latency. Owner-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_worker_pool_status: {
        name: "get_worker_pool_status",
        description: "Get the status of worker pools (translation and ratelimit workers). Owner-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    clear_translation_cache: {
        name: "clear_translation_cache",
        description: "Clear the translation cache to free up memory. Owner-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_user_warnings: {
        name: "get_user_warnings",
        description: "Get all warnings for a specific user, including active, expired, and appealed warnings.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_warning_details: {
        name: "get_warning_details",
        description: "Get detailed information about a specific warning by its ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                warningId: { type: SchemaType.NUMBER }
            },
            required: ["warningId"]
        }
    },
    appeal_warning: {
        name: "appeal_warning",
        description: "Submit an appeal for a warning. User can only appeal their own warnings.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                warningId: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId", "warningId", "reason"]
        }
    },
    get_pending_appeals: {
        name: "get_pending_appeals",
        description: "Get all pending warning appeals. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    review_appeal: {
        name: "review_appeal",
        description: "Review and approve or reject a warning appeal. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                warningId: { type: SchemaType.NUMBER },
                approved: { type: SchemaType.BOOLEAN },
                reviewNote: { type: SchemaType.STRING }
            },
            required: ["warningId", "approved"]
        }
    },
    global_ban_user: {
        name: "global_ban_user",
        description: "Ban a user globally from using bot features. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_unban_user: {
        name: "global_unban_user",
        description: "Remove a global ban from a user. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_mute_user: {
        name: "global_mute_user",
        description: "Mute a user globally from sending messages in global chat. Duration in milliseconds (0 for permanent). Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                duration: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_unmute_user: {
        name: "global_unmute_user",
        description: "Remove a global mute from a user. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_global_ban_status: {
        name: "get_global_ban_status",
        description: "Check if a user is globally banned and how many times they've been banned.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_global_mute_status: {
        name: "get_global_mute_status",
        description: "Check if a user is globally muted, the reason, and when the mute expires.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    create_support_ticket: {
        name: "create_support_ticket",
        description: "Create a new support ticket for a user. Can be used to help users submit bug reports, feature requests, or get help.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                category: { type: SchemaType.STRING },
                priority: { type: SchemaType.STRING },
                initialMessage: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING }
            },
            required: ["userId", "initialMessage"]
        }
    },
    get_ticket_details: {
        name: "get_ticket_details",
        description: "Get detailed information about a specific support ticket by its ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    get_user_tickets: {
        name: "get_user_tickets",
        description: "Get all support tickets for a specific user. Optionally filter by status (open, closed, etc).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                status: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    assign_ticket: {
        name: "assign_ticket",
        description: "Assign a support ticket to a staff member. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER },
                staffId: { type: SchemaType.STRING }
            },
            required: ["ticketId", "staffId"]
        }
    },
    close_ticket: {
        name: "close_ticket",
        description: "Close a support ticket. Users can close their own tickets, staff can close any ticket.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    add_ticket_message: {
        name: "add_ticket_message",
        description: "Add a message to an existing support ticket. Used for ticket conversation history.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER },
                userId: { type: SchemaType.STRING },
                username: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                isStaff: { type: SchemaType.BOOLEAN }
            },
            required: ["ticketId", "userId", "username", "content"]
        }
    },
    get_ticket_messages: {
        name: "get_ticket_messages",
        description: "Get all messages in a support ticket conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    add_staff_note: {
        name: "add_staff_note",
        description: "Add an internal staff note about a user. Staff-only command. These notes are not visible to users.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                note: { type: SchemaType.STRING }
            },
            required: ["userId", "note"]
        }
    },
    get_staff_notes: {
        name: "get_staff_notes",
        description: "Get all staff notes for a specific user. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    update_staff_status: {
        name: "update_staff_status",
        description: "Update staff member's status (online, busy, away, offline) and optional status message. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING },
                statusMessage: { type: SchemaType.STRING }
            },
            required: ["status"]
        }
    },
    get_staff_audit_log: {
        name: "get_staff_audit_log",
        description: "Get staff audit log entries. Can filter by staff member, action type, and limit results. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                staffId: { type: SchemaType.STRING },
                actionType: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            }
        }
    },
    get_rpg_character: {
        name: "get_rpg_character",
        description: "Get RPG character information including stats, level, experience, and more.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                accountId: { type: SchemaType.NUMBER }
            },
            required: ["userId"]
        }
    },
    get_rpg_inventory: {
        name: "get_rpg_inventory",
        description: "Get a character's RPG inventory with all items, quantities, and details.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                characterId: { type: SchemaType.NUMBER }
            },
            required: ["characterId"]
        }
    },
    get_rpg_equipment: {
        name: "get_rpg_equipment",
        description: "Get a character's currently equipped RPG items and their bonuses.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                characterId: { type: SchemaType.NUMBER }
            },
            required: ["characterId"]
        }
    },
    get_rpg_session: {
        name: "get_rpg_session",
        description: "Check if a user has an active RPG session and get session details.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_rpg_account_status: {
        name: "get_rpg_account_status",
        description: "Get RPG account status including frozen/banned status and reasons.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                accountId: { type: SchemaType.NUMBER }
            },
            required: ["accountId"]
        }
    },
    get_filter_config: {
        name: "get_filter_config",
        description: "Get the word filter configuration for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_filter_words: {
        name: "get_filter_words",
        description: "Get all filtered words for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_custom_responses: {
        name: "get_custom_responses",
        description: "Get all custom command responses configured for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_globalchat_config: {
        name: "get_globalchat_config",
        description: "Get the global chat configuration for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_command_list: {
        name: "get_command_list",
        description: "Get a list of all available bot commands with their names, descriptions, and categories.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_command_info: {
        name: "get_command_info",
        description: "Get detailed information about a specific command including options and parameters.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                commandName: { type: SchemaType.STRING }
            },
            required: ["commandName"]
        }
    },
    search_commands: {
        name: "search_commands",
        description: "Search for commands by name, description, or category.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING }
            },
            required: ["query"]
        }
    },
    get_bot_features: {
        name: "get_bot_features",
        description: "Get a comprehensive list of all bot features and capabilities.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_staff_permissions: {
        name: "get_staff_permissions",
        description: "Get staff rank permissions. If rankName provided, get specific rank details, otherwise get all ranks.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                rankName: { type: SchemaType.STRING }
            }
        }
    },
    check_vip_expiration: {
        name: "check_vip_expiration",
        description: "Check VIP status expiration date and days remaining for a user.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_system_info: {
        name: "get_system_info",
        description: "Get system information (platform, node version, memory usage, uptime). Owner-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    list_project_files: {
        name: "list_project_files",
        description: "List files and directories in the project repository. Supports recursive listing.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                recursive: { type: SchemaType.BOOLEAN },
                maxResults: { type: SchemaType.NUMBER }
            }
        }
    },
    read_project_file_lines: {
        name: "read_project_file_lines",
        description: "Read specific line ranges from a project file for targeted review.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                startLine: { type: SchemaType.NUMBER },
                endLine: { type: SchemaType.NUMBER }
            },
            required: ["path"]
        }
    },
    search_project_text: {
        name: "search_project_text",
        description: "Search for text within the project repository files.",
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
    project_file_info: {
        name: "project_file_info",
        description: "Get metadata about a project file or directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    list_log_files: {
        name: "list_log_files",
        description: "List available log files from the bot logs directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                maxResults: { type: SchemaType.NUMBER }
            }
        }
    },
    read_log_file_lines: {
        name: "read_log_file_lines",
        description: "Read specific line ranges from a log file.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                startLine: { type: SchemaType.NUMBER },
                endLine: { type: SchemaType.NUMBER }
            },
            required: ["path"]
        }
    },
    tail_log_file: {
        name: "tail_log_file",
        description: "Read the last N lines from a log file.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                lines: { type: SchemaType.NUMBER }
            },
            required: ["path"]
        }
    },
    search_logs: {
        name: "search_logs",
        description: "Search text across log files or within a specific log file.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                file: { type: SchemaType.STRING },
                maxResults: { type: SchemaType.NUMBER }
            },
            required: ["query"]
        }
    },
    github_list_repo_dir: {
        name: "github_list_repo_dir",
        description: "List directory contents from the GitHub repository.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                ref: { type: SchemaType.STRING }
            }
        }
    },
    github_fetch_repo_file: {
        name: "github_fetch_repo_file",
        description: "Fetch a file from the GitHub repository by path and optional ref.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                ref: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    github_search_repo: {
        name: "github_search_repo",
        description: "Search the GitHub repository using the code search API.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                path: { type: SchemaType.STRING },
                filename: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["query"]
        }
    },
    add_user_to_convo: {
        name: "add_user_to_convo",
        description: "Add a single additional user to the current AI chat so their messages are accepted.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    remove_user_from_convo: {
        name: "remove_user_from_convo",
        description: "Remove the additional user previously added to the current AI chat.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            }
        }
    },
    get_current_datetime: {
        name: "get_current_datetime",
        description: "Get the current date and time in ISO 8601 format.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
} as const satisfies Record<string, FunctionDeclaration>;

export const AIFunctionDeclarations = Object.values(functionDeclarations);

export type OpenAIToolDefinition = {
    type: "function";
    function: FunctionDeclaration;
};

const AIFunctions: OpenAIToolDefinition[] = AIFunctionDeclarations.map(fn => ({
    type: "function",
    function: fn
}));

export default AIFunctions;
