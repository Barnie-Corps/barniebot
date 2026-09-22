import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const workspaceDeclarations = {
    list_workspace_files: {
        name: "list_workspace_files",
        description: "List entries inside your personal ai_workspace directory. Files are isolated per user. Optionally provide a relative path and choose whether to traverse recursively.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                recursive: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            }
        }
    },
    read_workspace_file: {
        name: "read_workspace_file",
        description: "Read the contents of a file stored within your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                encoding: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    write_workspace_file: {
        name: "write_workspace_file",
        description: "Write a text file inside your personal ai_workspace directory. Creates intermediary directories if required.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["path", "content"]
        }
    },
    append_workspace_file: {
        name: "append_workspace_file",
        description: "Append text to a file inside your personal ai_workspace directory, creating it if it does not exist.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["path", "content"]
        }
    },
    delete_workspace_entry: {
        name: "delete_workspace_entry",
        description: "Delete a file or directory located inside your personal ai_workspace directory. Directories require the recursive flag.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                recursive: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    move_workspace_entry: {
        name: "move_workspace_entry",
        description: "Move or rename a file or directory inside your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                from: { type: SchemaType.STRING },
                to: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["from", "to"]
        }
    },
    create_workspace_directory: {
        name: "create_workspace_directory",
        description: "Create a directory (and any missing parents) inside your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["path"]
        }
    },
    download_to_workspace: {
        name: "download_to_workspace",
        description: "Download a remote resource and store it inside your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                url: { type: SchemaType.STRING },
                path: { type: SchemaType.STRING },
                overwrite: { type: SchemaType.BOOLEAN },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["url", "path"]
        }
    },
    search_workspace_text: {
        name: "search_workspace_text",
        description: "Search for text within files stored inside your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING },
                path: { type: SchemaType.STRING },
                maxResults: { type: SchemaType.NUMBER },
                requesterId: { type: SchemaType.STRING }
            },
            required: ["query"]
        }
    },
    workspace_file_info: {
        name: "workspace_file_info",
        description: "Retrieve metadata (size, type, last modification) about an entry inside your personal ai_workspace directory.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
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
        description: "Attach a file from your personal ai_workspace directory to the current conversation, allowing the user to download it directly.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                path: { type: SchemaType.STRING },
                requesterId: { type: SchemaType.STRING }
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

} satisfies Record<string, FunctionDeclaration>;

export default workspaceDeclarations;
