import * as crypto from "crypto";
import * as async from "async";
import Workers from "./Workers";
import path from "path";
import db from "./mysql/database";
import { ChatSession } from "@google/generative-ai";
import * as nodemailer from "nodemailer";
import Log from "./Log";
import AIFunctions from "./AIFunctions";
import data from "./data";
import client from ".";
import { promises as fs } from "fs";
import * as vm from "vm";
import { exec as execCallback } from "child_process";
import { promisify, inspect, TextDecoder, TextEncoder } from "util";
import * as mathjs from "mathjs";
const TRANSLATE_WORKER_TYPE = "translate";
const TRANSLATE_WORKER_PATH = path.join(__dirname, "workers/translate.js");
const TRANSLATE_WORKER_POOL_SIZE = 4;
const TRANSLATE_TIMEOUT = 15000;
const TRANSLATE_CACHE_TTL = 300000;
const TRANSLATE_CACHE_LIMIT = 500;
const translationCache = new Map<string, { value: string; expires: number }>();
const pendingTranslations = new Map<string, Promise<string>>();
const AI_WORKSPACE_ROOT = path.join(__dirname, "ai_workspace");
const MAX_WORKSPACE_SCAN_RESULTS = 50;
const MAX_FILE_SIZE_FOR_SEARCH = 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024; // 8MB, safe default for Discord without Nitro
const execPromise = promisify(execCallback);
const ALLOWED_SANDBOX_MODULES = new Map<string, unknown>([
  ["mathjs", mathjs]
]);
Workers.bulkCreateWorkers(TRANSLATE_WORKER_PATH, TRANSLATE_WORKER_TYPE, TRANSLATE_WORKER_POOL_SIZE);
const trimTranslationCache = () => {
  while (translationCache.size > TRANSLATE_CACHE_LIMIT) {
    const firstKey = translationCache.keys().next().value;
    if (!firstKey) break;
    translationCache.delete(firstKey);
  }
};
const resolveWorkspacePath = (targetPath = ".") => {
  const resolved = path.resolve(AI_WORKSPACE_ROOT, targetPath);
  if (!resolved.startsWith(AI_WORKSPACE_ROOT)) {
    throw new Error("Path escapes ai_workspace");
  }
  return resolved;
};
const ensureWorkspaceExists = async () => {
  await fs.mkdir(AI_WORKSPACE_ROOT, { recursive: true });
};
const safeStat = async (target: string) => {
  try {
    return await fs.stat(target);
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};
const readDirectoryRecursive = async (dir: string, limit: number, results: any[] = [], prefix = "") => {
  if (results.length >= limit) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    const fullPath = path.join(dir, entry.name);
    results.push({
      path: relativePath.replace(/\\/g, "/"),
      type: entry.isDirectory() ? "directory" : "file"
    });
    if (results.length >= limit) break;
    if (entry.isDirectory()) {
      await readDirectoryRecursive(fullPath, limit, results, relativePath);
      if (results.length >= limit) break;
    }
  }
  return results;
};
const collectSearchMatches = async (filePath: string, query: string, maxMatches: number) => {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const matches: { path: string; line: number; snippet: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(query.toLowerCase())) {
      matches.push({
        path: filePath.replace(AI_WORKSPACE_ROOT + path.sep, "").replace(/\\/g, "/"),
        line: i + 1,
        snippet: lines[i].trim().slice(0, 200)
      });
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
};
const isOwner = (userId: string | undefined | null): boolean => {
  if (!userId) return false;
  return data.bot.owners.includes(userId);
};
const formatLogValue = (value: any): string => {
  if (typeof value === "string") return value;
  try {
    return inspect(value, { depth: 2, maxArrayLength: 20, breakLength: 120 });
  } catch (error) {
    return String(value);
  }
};
const truncate = (value: string, limit = 4000): string => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…(truncated)`;
};
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "santiadjmc@gmail.com",
    pass: process.env.EMAIL_PASSWORD
  },
});
const utils = {
  createArrows: (length: number): string => {
    let arrows = "";
    for (let i = 0; i < length; i++) {
      arrows += "^";
    }
    return arrows;
  },
  AIFunctions: {
    get_user_data: async (id: string): Promise<any> => {
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [id]);
      if (!user[0]) return { error: "User not found" };
  const language: any = await db.query("SELECT * FROM languages WHERE userid = ?", [id]);
  return { user: user[0], language: language[0] ?? "en" };
    },
    set_user_language: async (args: { userId: string; language: string }): Promise<any> => {
      if (!args.userId || !args.language) return { error: "Missing parameters" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      const language: any = await db.query("SELECT * FROM languages WHERE userid = ?", [args.userId]);
      if (!language[0]) {
        await db.query("INSERT INTO languages SET ?", [{ userid: args.userId, lang: args.language }]);
      } else {
        await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: args.language }, args.userId]);
      }
      return { success: true };
    },
    fetch_url: async (args: { url: string }): Promise<any> => {
      if (!args.url) return { error: "Missing url parameter" };
      try {
        const response = await fetch(args.url);
        const text = await response.text();
        return { content: text };
      } catch (error) {
        return { error: "Failed to fetch URL" };
      }
    },
    retrieve_owners: (): string[] => {
      return data.bot.owners;
    },
    fetch_user: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      return { user: user[0] };
    },
    fetch_discord_user: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let user;
      let validUser = true;
      try {
        user = await client.users.fetch(args.userId);
      } catch (error) {
        validUser = false;
      }
      if (validUser) {
        return { user };
      } else {
        return { error: "User not found" };
      }
    },
    get_memories: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const memories: any = await db.query("SELECT * FROM ai_memories WHERE uid = ?", [args.userId]);
      return { memories: memories };
    },
    insert_memory: async (args: { userId: string; memory: string }): Promise<any> => {
      if (!args.userId || !args.memory) return { error: "Missing parameters" };
      await db.query("INSERT INTO ai_memories SET ?", [{ uid: args.userId, memory: args.memory }]);
      return { success: true };
    },
    fetch_ai_rules: async (): Promise<any> => {
      return require("./ai_rules.json").rules;
    },
    search_user_by_username: async (args: { username: string }): Promise<any> => {
      if (!args.username) return { error: "Missing username parameter" };
      const users: any = await db.query("SELECT * FROM discord_users WHERE username LIKE ?", [`%${args.username}%`]);
      return { users: users };
    },
    search_user_by_username_discord: async (args: { username: string }): Promise<any> => {
      if (!args.username) return { error: "Missing username parameter" };
      const users = client.users.cache.filter(u => u.username.toLowerCase().includes(args.username.toLowerCase()));
      return { users: Array.from(users.values()) };
    },
    update_user_data: async (args: { userId: string; data: any }): Promise<any> => {
      if (!args.userId || !args.data) return { error: "Missing parameters" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      await db.query("UPDATE discord_users SET ? WHERE id = ?", [args.data, args.userId]);
      return { success: true };
    },
    execute_query: async (args: { query: string; }): Promise<any> => {
      if (!args.query) return { error: "Missing query parameter" };
      try {
        const result: any = await db.query(args.query);
        return { result };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    on_guild: async (message: any): Promise<any> => {
      return { isGuild: message.guild !== null };
    },
    current_guild_info: async (message: any): Promise<any> => {
      if (!message.guild) return { error: "Not in a guild" };
      return { guild: { id: message.guild.id, name: message.guild.name, memberCount: message.guild.memberCount } };
    },
    guild_info: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      return { guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount } };
    },
    get_member_permissions: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { permissions: member.permissions.toArray() };
    },
    get_member_roles: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { roles: member.roles.cache.map(r => ({ id: r.id, name: r.name })) };
    },
    send_dm: async (args: { userId: string; content: string; }): Promise<any> => {
      if (!args.userId || !args.content) return { error: "Missing parameters" };
      let user;
      try {
        user = await client.users.fetch(args.userId);
      } catch (error) {
        return { error: "User not found" };
      }
      try {
        await user.send(args.content);
        return { success: true };
      } catch (error) {
        return { error: "Failed to send DM" };
      }
    },
    kick_member: async (args: { guildId: string; memberId: string; reason: string }): Promise<any> => {
      if (!args.guildId || !args.memberId || !args.reason) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      try {
        await member.kick(args.reason);
        return { success: true };
      } catch (error) {
        return { error: "Failed to kick member" };
      }
    },
    check_vip_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [args.userId]);
      if (foundVip.length > 0) {
        return { isVip: true, user: foundVip[0] };
      }
      return { isVip: false };
    },
    list_workspace_files: async (args: { path?: string; recursive?: boolean } = {}): Promise<any> => {
      await ensureWorkspaceExists();
      const directoryPath = resolveWorkspacePath(args.path ?? ".");
      const stats = await safeStat(directoryPath);
      if (!stats) return { error: "Path not found" };
      if (!stats.isDirectory()) return { error: "Target is not a directory" };
      if (args.recursive) {
        const entries = await readDirectoryRecursive(directoryPath, MAX_WORKSPACE_SCAN_RESULTS, [], path.relative(AI_WORKSPACE_ROOT, directoryPath) || "");
        return { entries };
      }
      const items = await fs.readdir(directoryPath, { withFileTypes: true });
      return {
        entries: items.map(item => ({
          path: path.join(path.relative(AI_WORKSPACE_ROOT, directoryPath), item.name).replace(/\\/g, "/"),
          type: item.isDirectory() ? "directory" : "file"
        }))
      };
    },
    read_workspace_file: async (args: { path: string; encoding?: BufferEncoding }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const filePath = resolveWorkspacePath(args.path);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "File not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      const encoding = args.encoding ?? "utf8";
      const content = await fs.readFile(filePath, encoding);
      return { content };
    },
    write_workspace_file: async (args: { path: string; content: string; overwrite?: boolean }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (typeof args.content !== "string") return { error: "Missing content parameter" };
      await ensureWorkspaceExists();
      const filePath = resolveWorkspacePath(args.path);
      const directory = path.dirname(filePath);
      await fs.mkdir(directory, { recursive: true });
      const stats = await safeStat(filePath);
      if (stats && !args.overwrite) return { error: "File already exists" };
      await fs.writeFile(filePath, args.content, "utf8");
      return { success: true };
    },
    append_workspace_file: async (args: { path: string; content: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (typeof args.content !== "string") return { error: "Missing content parameter" };
      await ensureWorkspaceExists();
      const filePath = resolveWorkspacePath(args.path);
      const directory = path.dirname(filePath);
      await fs.mkdir(directory, { recursive: true });
      await fs.appendFile(filePath, args.content, "utf8");
      return { success: true };
    },
    delete_workspace_entry: async (args: { path: string; recursive?: boolean }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const targetPath = resolveWorkspacePath(args.path);
      const stats = await safeStat(targetPath);
      if (!stats) return { error: "Path not found" };
      if (stats.isDirectory()) {
        if (!args.recursive) return { error: "Directory deletion requires recursive flag" };
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      return { success: true };
    },
    move_workspace_entry: async (args: { from: string; to: string; overwrite?: boolean }): Promise<any> => {
      if (!args?.from || !args.to) return { error: "Missing path parameters" };
      const source = resolveWorkspacePath(args.from);
      const destination = resolveWorkspacePath(args.to);
      const sourceStats = await safeStat(source);
      if (!sourceStats) return { error: "Source not found" };
      const destinationStats = await safeStat(destination);
      if (destinationStats) {
        if (!args.overwrite) return { error: "Destination already exists" };
        if (destinationStats.isDirectory()) {
          await fs.rm(destination, { recursive: true, force: true });
        } else {
          await fs.unlink(destination);
        }
      } else {
        await fs.mkdir(path.dirname(destination), { recursive: true });
      }
      await fs.rename(source, destination);
      return { success: true };
    },
    create_workspace_directory: async (args: { path: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const directoryPath = resolveWorkspacePath(args.path);
      await fs.mkdir(directoryPath, { recursive: true });
      return { success: true };
    },
    download_to_workspace: async (args: { url: string; path: string; overwrite?: boolean }): Promise<any> => {
      if (!args?.url || !args.path) return { error: "Missing parameters" };
      await ensureWorkspaceExists();
      const response = await fetch(args.url);
      if (!response.ok) return { error: `Failed to download resource: ${response.status}` };
      const filePath = resolveWorkspacePath(args.path);
      const stats = await safeStat(filePath);
      if (stats && !args.overwrite) return { error: "File already exists" };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(filePath, new Uint8Array(arrayBuffer));
      return { success: true };
    },
    search_workspace_text: async (args: { query: string; path?: string; maxResults?: number }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      await ensureWorkspaceExists();
      const basePath = resolveWorkspacePath(args.path ?? ".");
      const stats = await safeStat(basePath);
      if (!stats) return { error: "Path not found" };
      const maxResults = Math.max(1, Math.min(args.maxResults ?? MAX_WORKSPACE_SCAN_RESULTS, MAX_WORKSPACE_SCAN_RESULTS));
      const queue: string[] = [];
      if (stats.isDirectory()) {
        queue.push(basePath);
      } else if (stats.isFile()) {
        queue.push(basePath);
      } else {
        return { error: "Unsupported file type" };
      }
      const matches: { path: string; line: number; snippet: string }[] = [];
      while (queue.length > 0 && matches.length < maxResults) {
        const current = queue.shift() as string;
        const currentStats = await fs.stat(current);
        if (currentStats.isDirectory()) {
          const children = await fs.readdir(current);
          for (const child of children) {
            queue.push(path.join(current, child));
          }
        } else if (currentStats.isFile() && currentStats.size <= MAX_FILE_SIZE_FOR_SEARCH) {
          const fileMatches = await collectSearchMatches(current, args.query, maxResults - matches.length);
          matches.push(...fileMatches);
        }
      }
      return { matches };
    },
    workspace_file_info: async (args: { path: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const target = resolveWorkspacePath(args.path);
      const stats = await safeStat(target);
      if (!stats) return { error: "Path not found" };
      return {
        info: {
          path: args.path.replace(/\\/g, "/"),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          modified: stats.mtime.toISOString()
        }
      };
    },
    search_web: async (args: { query: string; numResults?: number; engineId?: string }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const apiKey = process.env.SEARCH_ENGINE_API_KEY;
      const engineId = args.engineId ?? process.env.SEARCH_ENGINE_CX;
      if (!apiKey || !engineId) return { error: "Search engine not configured" };
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", engineId);
      url.searchParams.set("q", args.query);
      if (args.numResults) url.searchParams.set("num", String(Math.min(Math.max(args.numResults, 1), 10)));
      const response = await fetch(url.toString());
      if (!response.ok) return { error: `Search request failed: ${response.status}` };
      const data = await response.json();
      if (!Array.isArray(data.items)) return { results: [] };
      return {
        results: data.items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        }))
      };
    },
    attach_workspace_file: async (args: { path: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      await ensureWorkspaceExists();
      const filePath = resolveWorkspacePath(args.path);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "File not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      if (stats.size > MAX_ATTACHMENT_SIZE) {
        const limitMb = (MAX_ATTACHMENT_SIZE / (1024 * 1024)).toFixed(1);
        return { error: `File exceeds ${limitMb}MB limit` };
      }
      const relativePath = path.relative(AI_WORKSPACE_ROOT, filePath).replace(/\\/g, "/");
      return {
        success: true,
        file: {
          path: relativePath,
          size: stats.size,
          name: path.basename(filePath)
        },
        __attachments: [
          {
            path: filePath,
            name: path.basename(filePath)
          }
        ]
      };
    },
    execute_js_code: async (args: { code: string; requesterId?: string }): Promise<any> => {
      if (!args?.code) return { error: "Missing code parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to execute code" };
      if (args.code.length > 5000) return { error: "Code is too long" };
      await ensureWorkspaceExists();
      const logs: string[] = [];
      const logLimit = 50;
      const pushLog = (...values: any[]) => {
        if (logs.length >= logLimit) return;
        logs.push(values.map(value => formatLogValue(value)).join(" "));
      };
      const workspaceAPI = {
        readFile: async (target: string) => {
          const resolved = resolveWorkspacePath(target);
          const fileStats = await safeStat(resolved);
          if (!fileStats) throw new Error("File not found");
          if (!fileStats.isFile()) throw new Error("Target is not a file");
          return fs.readFile(resolved, "utf8");
        },
        writeFile: async (target: string, content: string) => {
          if (typeof content !== "string") throw new Error("Content must be a string");
          const resolved = resolveWorkspacePath(target);
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.writeFile(resolved, content, "utf8");
          return true;
        },
        appendFile: async (target: string, content: string) => {
          if (typeof content !== "string") throw new Error("Content must be a string");
          const resolved = resolveWorkspacePath(target);
          await fs.mkdir(path.dirname(resolved), { recursive: true });
          await fs.appendFile(resolved, content, "utf8");
          return true;
        },
        deleteFile: async (target: string) => {
          const resolved = resolveWorkspacePath(target);
          const fileStats = await safeStat(resolved);
          if (!fileStats) throw new Error("Path not found");
          if (!fileStats.isFile()) throw new Error("Target is not a file");
          await fs.unlink(resolved);
          return true;
        },
        list: async (target = ".") => {
          const resolved = resolveWorkspacePath(target);
          const dirStats = await safeStat(resolved);
          if (!dirStats) throw new Error("Path not found");
          if (!dirStats.isDirectory()) throw new Error("Target is not a directory");
          const entries = await fs.readdir(resolved, { withFileTypes: true });
          return entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file"
          }));
        }
      } as const;
      const moduleCache = new Map<string, unknown>();
      const safeRequire = (requested: unknown) => {
        if (typeof requested !== "string") throw new Error("Module name must be a string");
        const moduleName = requested.trim();
        if (!ALLOWED_SANDBOX_MODULES.has(moduleName)) throw new Error(`Module "${moduleName}" is not allowed`);
        if (!moduleCache.has(moduleName)) {
          moduleCache.set(moduleName, ALLOWED_SANDBOX_MODULES.get(moduleName));
        }
        return moduleCache.get(moduleName);
      };
      Object.defineProperties(safeRequire, {
        cache: { value: Object.freeze({}), writable: false, enumerable: false },
        main: { value: undefined, writable: false, enumerable: false },
        resolve: {
          value: () => {
            throw new Error("require.resolve is not available inside the sandbox");
          },
          writable: false,
          enumerable: false
        },
        extensions: { value: undefined, writable: false, enumerable: false }
      });
      const sandbox: Record<string, any> = {
        console: {
          log: (...values: any[]) => pushLog(...values)
        },
        workspace: workspaceAPI,
        Buffer,
        TextEncoder,
        TextDecoder,
        Date,
        Math,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval
      };
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;
      sandbox.process = undefined;
      sandbox.require = safeRequire;
      sandbox.module = undefined;
      sandbox.exports = undefined;
      sandbox.__dirname = undefined;
      sandbox.__filename = undefined;
      try {
        const scriptSource = `(async () => {\n${args.code}\n})()`;
  const script = new vm.Script(scriptSource, { filename: "ai-workspace.js" });
        const context = vm.createContext(sandbox, { name: "ai-sandbox" });
        const timeoutMs = 5000;
        const resultPromise = script.runInContext(context, { timeout: 1000 });
        const executionResult = await Promise.race([
          resultPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Execution timed out")), timeoutMs))
        ]);
        const formattedResult = typeof executionResult === "undefined" ? "undefined" : formatLogValue(executionResult);
        return {
          success: true,
          logs,
          result: formattedResult
        };
      } catch (error: any) {
        return {
          error: error?.message ?? "Failed to execute code",
          logs
        };
      }
    },
    execute_command: async (args: { command: string; requesterId?: string }): Promise<any> => {
      if (!args?.command) return { error: "Missing command parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to execute commands" };
      const trimmedCommand = args.command.trim();
      if (!trimmedCommand) return { error: "Command cannot be empty" };
      if (trimmedCommand.length > 256) return { error: "Command is too long" };
      if (/[\r\n]/.test(trimmedCommand)) return { error: "Command cannot contain newline characters" };
      await ensureWorkspaceExists();
      try {
        const { stdout, stderr } = await execPromise(trimmedCommand, {
          cwd: AI_WORKSPACE_ROOT,
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          windowsHide: true
        });
        return {
          success: true,
          stdout: truncate(String(stdout ?? "").trim()),
          stderr: truncate(String(stderr ?? "").trim())
        };
      } catch (error: any) {
        return {
          error: error?.message ?? "Command execution failed",
          code: typeof error?.code === "number" ? error.code : null,
          stdout: truncate(String(error?.stdout ?? "").trim()),
          stderr: truncate(String(error?.stderr ?? "").trim())
        };
      }
    }
  },
  createSpaces: (length: number): string => {
    let spaces = "";
    for (let i = 0; i < length; i++) {
      spaces += " ";
    }
    return spaces;
  },
  createCensored: (length: number): string => {
    let censor = "";
    for (let i = 0; i < length; i++) {
      censor += "*";
    }
    return censor;
  },
  translate: async (text: string, from: string, target: string): Promise<any> => {
    const cacheKey = `${from}->${target}:${text}`;
    const cached = translationCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expires > now) return { text: cached.value };
    if (pendingTranslations.has(cacheKey)) {
      const shared = pendingTranslations.get(cacheKey) as Promise<string>;
      return { text: await shared };
    }
    const task = (async () => {
      const worker = Workers.getAvailableWorker(TRANSLATE_WORKER_TYPE) ?? (Workers.createWorker(TRANSLATE_WORKER_PATH, TRANSLATE_WORKER_TYPE) as unknown as { type: string; worker: Worker; id: string } | undefined);
      if (!worker) throw new Error("Unable to acquire translate worker");
      const messageId = Workers.postMessage(worker.id, { text, from, to: target });
      const response = await Workers.awaitResponse(worker.id, messageId, TRANSLATE_TIMEOUT);
      if (response.message?.error) throw new Error(response.message.error);
      const translatedText = String(response.message.translation ?? "");
      translationCache.set(cacheKey, { value: translatedText, expires: Date.now() + TRANSLATE_CACHE_TTL });
      trimTranslationCache();
      return translatedText;
    })();
    pendingTranslations.set(cacheKey, task);
    try {
      const translated = await task;
      return { text: translated };
    } finally {
      pendingTranslations.delete(cacheKey);
    }
  },
  parallel: (functions: any): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (typeof functions !== "object")
        reject(new TypeError("functions parameter must be of type object"));
      async.parallel(functions, (err, results) => {
        if (err) reject(err);
        else resolve(results as any[]);
      });
    });
  },
  autoTranslate: async (obj: any, language: string, target: string): Promise<typeof obj> => {
    if (typeof obj !== "object" || Array.isArray(obj)) throw new TypeError(`The autoTranslate function takes as first argument an object, got ${Array.isArray(obj) ? "Array" : typeof obj}`);
    if (typeof language !== "string") throw new TypeError(`The autoTranslate function takes as second argument a string, got ${typeof language}`);
    const keys = Object.keys(obj);
    const newObj = { ...obj };
    const validKeys: string[] = [];
    for (const k of keys) {
      if (typeof obj[k] === "object" && !Array.isArray(obj)) {
        const newProperty = await utils.autoTranslate(obj[k], language, target);
        newObj[k] = newProperty;
        continue;
      }
      if (typeof obj[k] !== "string") continue;
      validKeys.push(k);
    }
    await Promise.all(validKeys.map(async vk => {
      const translated = await utils.translate(obj[vk], language, target);
      newObj[vk] = translated.text;
    }));
    return newObj;
  },
  encryptWithAES: (key: string, data: string): string => {
    const iv = Uint8Array.from(crypto.randomBytes(16));
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64") as crypto.CipherKey,
      iv
    );
    let crypted = cipher.update(data, "utf8", "hex");
    crypted += cipher.final("hex");
    return iv.toString() + ":" + crypted;
  },
  decryptWithAES: (key: string, data: string): string | null => {
    const textParts = data.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return null;
    const encrypted = textParts.join(":");
    if (!encrypted) return null;
    const iv = Uint8Array.from(Buffer.from(ivHex, "hex"));
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64") as crypto.CipherKey,
      iv
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  },
  replaceNonLetters: (input: string): string => {
    const regex = /\*\*(.*?)\*\*/g;
    const result = input.replace(regex, "$1");
    return result;
  },
  // getAiResponse: async (text: string, lang: string, id: string, isStart: boolean): Promise<string> => {
  //   const modelId = "ChitChatterLdJSpZu";
  //   let texts = {
  //     mainMessage: "Speak in English",
  //     mainReply: "Okay, I'll speak in English",
  //     instruction: "REMEMBER: Do not generate a response longer than 1800 characters"
  //   }
  //   if (lang !== "es") {
  //     texts = await utils.autoTranslate(texts, "es", lang);
  //     texts.mainMessage = (function () {
  //       const t = texts.mainMessage.trim().split(" ");
  //       t[2] = langs.where(1, lang)?.local as string;
  //       return t.join(" ");
  //     })();
  //     texts.mainReply = (function () {
  //       const t = texts.mainReply.trim().split(" ");
  //       t[6] = langs.where(1, lang)?.local as string;
  //       return t.join(" ");
  //     })();
  //   }
  //   const url = "https://www.blackbox.ai/api/chat";

  //   const getMessage = (content: string, role: string = "user") => {
  //     return {
  //       content: content,
  //       id,
  //       role: role,
  //       createdAt: new Date().toISOString()
  //     };
  //   };
  //   const sendRequest = async (args: string) => {
  //     const agentMode = {
  //       mode: true,
  //       id: modelId
  //     };

  //     const messages = [
  //       getMessage(texts.mainMessage),
  //       getMessage(texts.mainReply, "assistant"),
  //       getMessage(`${args}\n${texts.instruction}`)
  //     ];
  //     if (!isStart) messages.splice(0, 2);

  //     const responsePayload = {
  //       messages: messages,
  //       previewToken: null,
  //       codeModelMode: true,
  //       agentMode: agentMode,
  //       trendingAgentMode: {},
  //       isMicMode: false,
  //       maxTokens: 1024 / 2
  //     };

  //     try {
  //       const response = await fetch(url, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0'
  //         },
  //         body: JSON.stringify(responsePayload)
  //       });
  //       const result = (await response.text()).split("$@$")[2]
  //       return result;
  //     } catch (error: any) {
  //       console.error('Error sending request:', error.stack);
  //     }
  //   };
  //   return await sendRequest(text) as string;
  // },
  isVIP: async (id: string) => {
    const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [id]);
    if (!foundVip[0]) return false;
    else return true;
  },
  getAiResponse: async (prompt: string, chat: ChatSession) => {
    let result;
    try {
      result = await chat.sendMessage(prompt);
    } catch (error: any) {
      console.error("Error getting AI response:", error, error.stack);
      return { text: "Error: Could not get a response from the AI service. Please try again later.", call: null };
    }
    const response = result.response;
    const text = response.text();
    return { text, call: response.functionCalls()?.[0] ?? null };
  },
  sendEmail: async (to: string, subject: string, text: string, html?: string) => {
    if (!to || !subject) throw new Error("Missing important data in utils.sendEmail");
    if (!text && !html) throw new Error("Missing content in utils.sendEmail");
    const data = await transporter.sendMail({
      from: '"BarnieCorps" <santiadjmc@gmail.com>',
      to,
      subject,
      text,
      html
    });
    if (data.rejected.length > 0) {
      Log.error(`${data.rejected.length}/${data.rejected.length + data.accepted.length} couldn't receive the email due to an unknown rejection by the SMTP server.`);
    }
  },
  sumNumbers: (numbers: number[]): number => {
    let sum = 0;
    for (const n of numbers) {
      sum += n;
    }
    return sum;
  }
};
export default utils;