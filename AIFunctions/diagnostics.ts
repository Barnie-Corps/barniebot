// AI tool declarations: Bot statistics, command introspection, staff permissions, and project/log file introspection.
import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const diagnosticsDeclarations = {
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
    is_staff: {
        name: "is_staff",
        description: "Check whether a user is staff and return their staff rank (if any).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_user_staff_rank: {
        name: "get_user_staff_rank",
        description: "Get a user's staff rank, or null if they are not staff.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
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
    get_current_datetime: {
        name: "get_current_datetime",
        description: "Get the current date and time in ISO 8601 format.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default diagnosticsDeclarations;
