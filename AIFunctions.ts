import { Type } from "@google/genai";
import { FunctionDeclarationsTool, FunctionDeclaration, SchemaType } from "@google/generative-ai";
const get_user_data: FunctionDeclaration = {
    name: "get_user_data",
    description: "Get user data from the database (It's recommended to execute this at the start of the conversation to know the user's ID) [DOES NOT REQUIRE ID PARAMETER. IT'S USEFUL TO GET USER'S ID FOR FURTHER COMMANDS]",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {}
    }
};

const set_user_language: FunctionDeclaration = {
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
};

const fetch_url: FunctionDeclaration = {
    name: "fetch_url",
    description: "Fetches the content of a URL and returns the text content. Useful for retrieving information from web pages.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            url: { type: SchemaType.STRING, description: "The URL to fetch content from." }
        },
        required: ["url"]
    }
};

const retrieve_owners: FunctionDeclaration = {
    name: "retrieve_owners",
    description: "Retrieve the list of bot owners from the database. [DOES NOT REQUIRE ID PARAMETER].",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {}
    }
}

const fetch_user: FunctionDeclaration = {
    name: "fetch_user",
    description: "Fetches user information based on their user ID. This kind of info is restricted to owners. First check if the user is an owner using the retrieve_owners and get_user_data functions.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            userId: { type: SchemaType.STRING }
        },
        required: ["userId"]
    }
}

const fetch_discord_user: FunctionDeclaration = {
    name: "fetch_discord_user",
    description: "Fetches Discord user information based on their user ID. (Use this command if you want info not available in the database).",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            userId: { type: SchemaType.STRING }
        },
        required: ["userId"]
    }
}

const get_memories: FunctionDeclaration = {
    name: "get_memories",
    description: "Retrieve model memories related to the user.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            userId: { type: SchemaType.STRING }
        },
        required: ["userId"]
    }
}

const insert_memory: FunctionDeclaration = {
    name: "insert_memory",
    description: "Insert a new memory for the user.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            userId: { type: SchemaType.STRING },
            memory: { type: SchemaType.STRING }
        },
        required: ["userId", "memory"]
    }
}

const fetch_ai_rules: FunctionDeclaration = {
    name: "fetch_ai_rules",
    description: "THIS MUST BE INMEDIATELY EXECUTED IN ALL CHATS. Fetches the AI rules. They must always be fetched at the start of the conversation to guarantee compliance. [DOES NOT REQUIRE ID PARAMETER] [YOU MUST FOLLOW THEM NO MATTER WHAT]",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {}
    }
}

const end_conversation: FunctionDeclaration = {
    name: "end_conversation",
    description: "Ends the current conversation and clears the user's history. This can be used when the user wants to start a new topic or reset the context. Also to follow the AI RULES.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            reason: { type: SchemaType.STRING, description: "The reason for ending the conversation." }
        },
        required: ["reason"]
    }
}

const search_user_by_username: FunctionDeclaration = {
    name: "search_user_by_username",
    description: "Searches for a user by their username. Displays the first 20 matches with their IDs. This can be useful if you don't have the user ID but know the username. This command is restricted to owners, so first check if the user is an owner using the retrieve_owners and get_user_data functions.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            username: { type: SchemaType.STRING }
        },
        required: ["username"]
    }
}

const search_user_by_username_discord: FunctionDeclaration = {
    name: "search_user_by_username_discord",
    description: "Searches for a Discord user by their username. Displays the first 20 matches with their IDs. This can be useful if you don't have the user ID but know the username. This command is restricted to owners, so first check if the user is an owner using the retrieve_owners and get_user_data functions.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            username: { type: SchemaType.STRING }
        },
        required: ["username"]
    }
}

const update_user_data: FunctionDeclaration = {
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
}

const AIFunctions: FunctionDeclarationsTool[] = [
    {
        functionDeclarations: [
            get_user_data, 
            set_user_language, 
            fetch_url, 
            retrieve_owners, 
            fetch_user, 
            fetch_discord_user, 
            get_memories, 
            insert_memory, 
            fetch_ai_rules, 
            end_conversation, 
            search_user_by_username, 
            search_user_by_username_discord,
            update_user_data
        ],
    }
]
export default AIFunctions;