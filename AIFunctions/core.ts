import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const coreDeclarations = {
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
        description: "Fetches the content of an HTTP or HTTPS URL using the safe URL fetch path. Useful for retrieving text from web pages.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                url: { type: SchemaType.STRING, description: "The URL to fetch content from." }
            },
            required: ["url"]
        }
    },
    api_request: {
        name: "api_request",
        description: "Makes an HTTP API request with full control over method, headers, body, and query parameters. Use for calling REST APIs, webhooks, and external services. Supports GET, POST, PUT, and PATCH methods.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                method: { type: SchemaType.STRING, description: "HTTP method: GET, POST, PUT, or PATCH" },
                url: { type: SchemaType.STRING, description: "The full URL to send the request to." },
                headers: { type: SchemaType.OBJECT, description: "Optional request headers as key-value pairs." },
                body: { type: SchemaType.STRING, description: "Optional request body (for POST, PUT, PATCH)." },
                query: { type: SchemaType.OBJECT, description: "Optional query parameters as key-value pairs, appended to the URL." }
            },
            required: ["method", "url"]
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
    list_knowledge_sources: {
        name: "list_knowledge_sources",
        description: "List available knowledge sources for support and policy questions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING }
            }
        }
    },
    search_knowledge: {
        name: "search_knowledge",
        description: "Search local knowledge sources for support-related answers. Use this before answering support or policy questions.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER },
                includeProjectDocs: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["query"]
        }
    },
    get_knowledge_source: {
        name: "get_knowledge_source",
        description: "Fetch a knowledge source by ID for full context.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sourceId: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["sourceId"]
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
    generate_code: {
        name: "generate_code",
        description: "Generate code for the provided prompt using the programming-optimized model. Use for creating files, snippets, or structured outputs when the user requests code. This does not automatically create files in the workspace nor attaches the code to the conversation, it only generates the code text which can then be used with other functions to save or share.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                prompt: { type: SchemaType.STRING, description: "Clear instructions for the code to produce." }
            },
            required: ["prompt"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default coreDeclarations;
