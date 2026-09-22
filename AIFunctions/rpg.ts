import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const rpgDeclarations = {
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

} satisfies Record<string, FunctionDeclaration>;

export default rpgDeclarations;
