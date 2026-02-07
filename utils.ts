import * as crypto from "crypto";
import * as async from "async";
import Workers from "./Workers";
import type { WorkerHandle } from "./managers/WorkerManager";
import StaffRanksManager from "./managers/StaffRanksManager";
import path from "path";
import db from "./mysql/database";
import type { NIMChatSession } from "./managers/NVIDIAModelsManager";
import * as nodemailer from "nodemailer";
import * as os from "os";
import Log from "./Log";
import data from "./data";
import client from ".";
import { promises as fs } from "fs";
import * as vm from "vm";
import { exec as execCallback } from "child_process";
import { promisify, inspect, TextDecoder, TextEncoder } from "util";
import * as mathjs from "mathjs";
import { ChannelType, PermissionFlagsBits, PermissionsBitField, EmbedBuilder } from "discord.js";
import type { DiscordUser, UserLanguage, AIMemory } from "./types/interfaces";
const TRANSLATE_WORKER_TYPE = "translate";
const RATELIMIT_WORKER_TYPE = "ratelimit";
const TRANSLATE_WORKER_PATH = path.join(__dirname, "workers/translate.js");
const RATELIMIT_WORKER_PATH = path.join(__dirname, "workers/ratelimit.js");
// Dynamic pool size with sane caps; allow override via env TRANSLATE_WORKERS
// Windows optimization: reduce pool size to avoid thread contention
const TRANSLATE_WORKER_POOL_SIZE = (() => {
  const fromEnv = Number(process.env.TRANSLATE_WORKERS);
  if (!Number.isNaN(fromEnv) && fromEnv > 0) return Math.max(1, Math.min(16, fromEnv));
  const cores = Array.isArray(os.cpus()) ? os.cpus().length : 4;
  const isWindows = process.platform === "win32";
  // Windows: more conservative pool size due to slower thread creation
  return isWindows ? Math.max(2, Math.min(4, cores)) : Math.max(2, Math.min(8, Math.ceil(cores / 2)));
})();
// Windows: increased timeout due to slower DNS resolution and connection setup
const TRANSLATE_TIMEOUT = process.platform === "win32" ? 25000 : 15000;
const TRANSLATE_CACHE_TTL = 300000;
const TRANSLATE_CACHE_LIMIT = 500;
const TRANSLATE_MAX_RETRIES = 3;
const TRANSLATE_RETRY_BASE_DELAY = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_TIMEOUT = 60000;
const translationCache = new Map<string, { value: string; expires: number }>();
const pendingTranslations = new Map<string, Promise<string>>();

// Circuit breaker state
let circuitBreakerFailures = 0;
let circuitBreakerLastFailure = 0;
let circuitBreakerOpen = false;
const AI_WORKSPACE_ROOT = path.join(__dirname, "ai_workspace");
const MAX_WORKSPACE_SCAN_RESULTS = 50;
const MAX_FILE_SIZE_FOR_SEARCH = 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024; // 8MB, safe default for Discord without Nitro
const PROJECT_ROOT = process.cwd();
const LOGS_ROOT = path.join(PROJECT_ROOT, "logs");
const MAX_PROJECT_SCAN_RESULTS = 200;
const MAX_LOG_READ_LINES = 500;
const execPromise = promisify(execCallback);
const ALLOWED_SANDBOX_MODULES = new Map<string, unknown>([
  ["mathjs", mathjs]
]);
// Create the initial pool and prewarm it to avoid cold-start latency after inactivity
Workers.bulkCreateWorkers(TRANSLATE_WORKER_PATH, TRANSLATE_WORKER_TYPE, TRANSLATE_WORKER_POOL_SIZE);
// Fire-and-forget warmup pings; ignore failures (workers will be recreated on-demand if needed)
void (async () => {
  try {
    await Workers.prewarmType(TRANSLATE_WORKER_TYPE, TRANSLATE_WORKER_POOL_SIZE, 1500);
  } catch { }
})();
// Ensure at least one ratelimit worker exists and is prewarmed at startup to avoid cold starts
Workers.bulkCreateWorkers(RATELIMIT_WORKER_PATH, RATELIMIT_WORKER_TYPE, 1);
void (async () => { try { await Workers.prewarmType(RATELIMIT_WORKER_TYPE, 1, 1000); } catch { } })();

// Small helper to process ratelimits via worker
async function processRateLimitsWorker(users: Array<{ uid: string; time_left: number }>, limits: Array<{ uid: string; time_left: number; username: string }>, decrementMs = 1000) {
  let worker = Workers.getAvailableWorker(RATELIMIT_WORKER_TYPE);
  if (!worker) worker = Workers.createWorker(RATELIMIT_WORKER_PATH, RATELIMIT_WORKER_TYPE) ?? undefined;
  if (!worker) worker = await Workers.AwaitAvailableWorker(RATELIMIT_WORKER_TYPE, 2000);
  const msgId = Workers.postMessage(worker.id, { type: "process", users, limits, decrement: decrementMs });
  const response = await Workers.awaitResponse(worker.id, msgId, 2000);
  return response.message;
}
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
const resolveProjectPath = (targetPath = ".") => {
  const resolved = path.resolve(PROJECT_ROOT, targetPath);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error("Path escapes project root");
  }
  return resolved;
};
const resolveLogsPath = (targetPath = ".") => {
  const resolved = path.resolve(LOGS_ROOT, targetPath);
  if (!resolved.startsWith(LOGS_ROOT)) {
    throw new Error("Path escapes logs directory");
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
const collectProjectSearchMatches = async (filePath: string, query: string, maxMatches: number) => {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const matches: { path: string; line: number; snippet: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(query.toLowerCase())) {
      matches.push({
        path: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/"),
        line: i + 1,
        snippet: lines[i].trim().slice(0, 200)
      });
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
};
const isOwner = (userId: string | undefined | null): boolean | string => {
  if (!userId) return "no valid userId provided";
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
const parseToolCalls = (content: string): { cleanedText: string; toolCalls: Array<{ name: string; args: any }> } => {
  const toolCalls: Array<{ name: string; args: any }> = [];
  const beginTokens = ["<|tool_call_begin|>", "|tool_call_begin|"];
  const sepTokens = ["<|tool_sep|>", "|tool_sep|"];
  const endTokens = ["<|tool_call_end|>", "|tool_call_end|"];
  const callsBeginTokens = ["<|tool_calls_begin|>", "|tool_calls_begin|"];
  const callsEndTokens = ["<|tool_calls_end|>", "|tool_calls_end|"];
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  const tryParseArgs = (raw: string) => {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, value: {} };
    }
  };
  const repairJson = (raw: string) => {
    let candidate = raw;
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1);
    }
    const openBraces = (candidate.match(/\{/g) || []).length;
    const closeBraces = (candidate.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      candidate = candidate + "}".repeat(openBraces - closeBraces);
    }
    const quoteCount = (candidate.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      candidate = candidate + '"';
    }
    return candidate;
  };
  while (true) {
    const beginIdx = beginTokens.reduce((best, token) => {
      const idx = content.indexOf(token, cursor);
      if (idx === -1) return best;
      return best === -1 || idx < best ? idx : best;
    }, -1 as number);
    if (beginIdx === -1) break;
    const matchedBeginToken = beginTokens.find(token => content.startsWith(token, beginIdx)) ?? beginTokens[0];
    const nameStart = beginIdx + matchedBeginToken.length;
    const sepIdx = sepTokens.reduce((best, token) => {
      const idx = content.indexOf(token, nameStart);
      if (idx === -1) return best;
      return best === -1 || idx < best ? idx : best;
    }, -1 as number);
    if (sepIdx === -1) break;
    const name = content.slice(nameStart, sepIdx).trim();
    const matchedSepToken = sepTokens.find(token => content.startsWith(token, sepIdx)) ?? sepTokens[0];
    const argsStart = sepIdx + matchedSepToken.length;
    let endIdx = endTokens.reduce((best, token) => {
      const idx = content.indexOf(token, argsStart);
      if (idx === -1) return best;
      return best === -1 || idx < best ? idx : best;
    }, -1 as number);
    if (endIdx === -1) {
      const nextBegin = beginTokens.reduce((best, token) => {
        const idx = content.indexOf(token, argsStart);
        if (idx === -1) return best;
        return best === -1 || idx < best ? idx : best;
      }, -1 as number);
      const nextCallsEnd = callsEndTokens.reduce((best, token) => {
        const idx = content.indexOf(token, argsStart);
        if (idx === -1) return best;
        return best === -1 || idx < best ? idx : best;
      }, -1 as number);
      const candidates = [nextBegin, nextCallsEnd, content.length].filter(v => v !== -1) as number[];
      endIdx = Math.min(...candidates);
    }
    const rawArgs = content.slice(argsStart, endIdx).trim();
    let parsedArgs: any = {};
    const primaryCandidate = (() => {
      const firstBrace = rawArgs.indexOf("{");
      const lastBrace = rawArgs.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return rawArgs.slice(firstBrace, lastBrace + 1);
      }
      return rawArgs;
    })();
    const primaryParse = tryParseArgs(primaryCandidate);
    if (primaryParse.ok) {
      parsedArgs = primaryParse.value;
    } else {
      const repaired = repairJson(primaryCandidate);
      const repairedParse = tryParseArgs(repaired);
      parsedArgs = repairedParse.ok ? repairedParse.value : {};
    }
    toolCalls.push({ name, args: parsedArgs });
    const matchedEndToken = endTokens.find(token => content.startsWith(token, endIdx)) ?? endTokens[0];
    const rangeEnd = endIdx === -1 ? content.length : endIdx + (content.slice(endIdx, endIdx + matchedEndToken.length) === matchedEndToken ? matchedEndToken.length : 0);
    ranges.push({ start: beginIdx, end: rangeEnd });
    cursor = rangeEnd;
  }
  const removalRanges = ranges.sort((a, b) => a.start - b.start);
  let cleaned = "";
  let lastIndex = 0;
  for (const range of removalRanges) {
    if (range.start > lastIndex) cleaned += content.slice(lastIndex, range.start);
    lastIndex = Math.max(lastIndex, range.end);
  }
  if (lastIndex < content.length) cleaned += content.slice(lastIndex);
  for (const token of callsBeginTokens) {
    cleaned = cleaned.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
  }
  for (const token of callsEndTokens) {
    cleaned = cleaned.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
  }
  cleaned = cleaned.trim();
  return { cleanedText: cleaned, toolCalls };
};
const getGuildAndMember = async (guildId: string, userId: string) => {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { error: "Guild not found" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: "Member not found in guild" };
  return { guild, member };
};
const isSystemRequester = (requesterId?: string | null) => requesterId === "__ai_monitor__";
const isAdminStaffUser = async (userId: string) => {
  const rank = await utils.getUserStaffRank(userId);
  return StaffRanksManager.hasMinimumRank(rank, "Administrator");
};
const hasGuildPermission = (member: any, permission: bigint) => {
  return member.permissions?.has(permission);
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
  createArrows: (length: number): string => "^".repeat(length),
  parseToolCalls,
  AIFunctions: {
    get_user_data: async (id: string): Promise<{ error: string } | { user: DiscordUser; language: UserLanguage | string }> => {
      const user = await db.query("SELECT * FROM discord_users WHERE id = ?", [id]) as unknown as DiscordUser[];
      if (!user[0]) return { error: "User not found" };
      const language = await db.query("SELECT * FROM languages WHERE userid = ?", [id]) as unknown as UserLanguage[];
      return { user: user[0], language: language[0] ?? "en" };
    },
    set_user_language: async (args: { userId: string; language: string }): Promise<{ error: string } | { success: true }> => {
      if (!args.userId || !args.language) return { error: "Missing parameters" };
      const user = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]) as unknown as DiscordUser[];
      if (!user[0]) return { error: "User not found" };
      const language = await db.query("SELECT * FROM languages WHERE userid = ?", [args.userId]) as unknown as UserLanguage[];
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
    fetch_url_safe: async (args: { url: string; maxChars?: number; timeoutMs?: number }): Promise<any> => {
      if (!args.url) return { error: "Missing url parameter" };
      let parsed: URL;
      try {
        parsed = new URL(args.url);
      } catch {
        return { error: "Invalid URL" };
      }
      if (!/^https?:$/.test(parsed.protocol)) return { error: "Only http/https URLs are allowed" };
      const maxBytes = 200 * 1024;
      const maxChars = Math.min(Math.max(args.maxChars ?? 50000, 1000), 50000);
      const timeoutMs = Math.min(Math.max(args.timeoutMs ?? 4000, 1000), 8000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(parsed.toString(), {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": "BarnieBot-AIMonitor/1.0" },
          signal: controller.signal as any
        });
        const status = response.status;
        const contentType = response.headers.get("content-type") || "";
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (status >= 300 && status < 400) {
          const location = response.headers.get("location") || "";
          return { error: "Redirect blocked", status, location };
        }
        if (status < 200 || status >= 300) return { error: `HTTP ${status}`, status };
        if (contentLength && contentLength > maxBytes) return { error: "Content too large", status, contentLength };
        if (!/^text\//i.test(contentType) && !/application\/(json|xml)/i.test(contentType)) {
          return { error: "Unsupported content type", status, contentType };
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length > maxBytes) return { error: "Content too large", status, contentLength: buf.length };
        const text = buf.toString("utf8").slice(0, maxChars);
        return { url: parsed.toString(), status, contentType, truncated: text.length >= maxChars, content: text };
      } catch (error: any) {
        return { error: error?.name === "AbortError" ? "Request timed out" : "Failed to fetch URL" };
      } finally {
        clearTimeout(timer);
      }
    },
    retrieve_owners: (): string[] => {
      return data.bot.owners;
    },
    isOwner: (userId: string): boolean | string => {
      return isOwner(userId);
    },
    fetch_user: async (args: { userId: string }): Promise<{ error: string } | { user: DiscordUser }> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const user = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]) as unknown as DiscordUser[];
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
    get_memories: async (args: { userId: string }): Promise<{ error: string } | { memories: AIMemory[] }> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const memories = await db.query("SELECT * FROM ai_memories WHERE uid = ?", [args.userId]) as unknown as AIMemory[];
      return { memories };
    },
    insert_memory: async (args: { userId: string; memory: string }): Promise<any> => {
      if (!args.userId || !args.memory) return { error: "Missing parameters" };
      await db.query("INSERT INTO ai_memories SET ?", [{ uid: args.userId, memory: args.memory }]);
      return { success: true };
    },
    remove_memory: async (args: { userId: string; memoryId: number }): Promise<any> => {
      if (!args.userId || !args.memoryId) return { error: "Missing parameters" };
      await db.query("DELETE FROM ai_memories WHERE id = ? AND uid = ?", [args.memoryId, args.userId]);
      return { success: true };
    },
    remove_memories: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      await db.query("DELETE FROM ai_memories WHERE uid = ?", [args.userId]);
      return { success: true };
    },
    fetch_ai_rules: async (): Promise<any> => {
      return require("./ai_rules.json");
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
    get_message_context: async (args: { requesterId?: string; guildId?: string; channelId?: string; messageId?: string; limit?: number }): Promise<any> => {
      if (!args.guildId || !args.channelId || !args.messageId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      const target = await channel.messages.fetch(args.messageId).catch(() => null);
      if (!target) return { error: "Message not found" };
      const limit = Math.max(1, Math.min(args.limit ?? 12, 20));
      const around = await channel.messages.fetch({ limit, around: args.messageId }).catch(() => null);
      const aroundList = around ? Array.from(around.values()) : [];
      const mapMsg = (m: any) => ({
        id: m.id,
        authorId: m.author?.id ?? null,
        authorTag: m.author?.tag ?? null,
        content: m.content,
        createdAt: m.createdTimestamp,
        attachments: m.attachments.map((a: any) => ({ url: a.url, name: a.name, size: a.size, contentType: a.contentType }))
      });
      return {
        guild: { id: guild.id, name: guild.name },
        channel: { id: channel.id, name: channel.name },
        message: mapMsg(target),
        around: aroundList.sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp).map(mapMsg)
      };
    },
    get_user_context: async (args: { requesterId?: string; guildId?: string; userId?: string }): Promise<any> => {
      if (!args.guildId || !args.userId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.KickMembers) || hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const user = await client.users.fetch(args.userId).catch(() => null);
      const member = await guild.members.fetch(args.userId).catch(() => null);
      return {
        user: user ? {
          id: user.id,
          tag: user.tag,
          createdAt: user.createdTimestamp,
          bot: user.bot
        } : null,
        member: member ? {
          id: member.id,
          joinedAt: member.joinedTimestamp,
          nick: member.nickname ?? null,
          roles: member.roles.cache.map((r: any) => ({ id: r.id, name: r.name })),
          permissions: member.permissions?.toArray?.() ?? [],
          communicationDisabledUntil: member.communicationDisabledUntilTimestamp ?? null
        } : null
      };
    },
    get_guild_context: async (args: { requesterId?: string; guildId?: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const botMember = guild.members.me;
      const canViewInvites = botMember?.permissions?.has(PermissionFlagsBits.ManageGuild);
      let invites: any[] | null = null;
      if (canViewInvites) {
        const list = await guild.invites.fetch().catch(() => null);
        invites = list ? Array.from(list.values()).slice(0, 5).map(inv => ({
          code: inv.code,
          uses: inv.uses ?? 0,
          maxUses: inv.maxUses ?? 0,
          channelId: inv.channelId,
          inviterId: inv.inviter?.id ?? null
        })) : null;
      }
      const channelCounts = {
        text: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText).size,
        voice: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice).size,
        category: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildCategory).size
      };
      return {
        guild: {
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          memberCount: guild.memberCount,
          createdAt: guild.createdTimestamp,
          verificationLevel: guild.verificationLevel,
          mfaLevel: guild.mfaLevel,
          features: guild.features
        },
        counts: {
          roles: guild.roles.cache.size,
          channels: guild.channels.cache.size,
          ...channelCounts
        },
        invites
      };
    },
    list_guild_channels: async (args: { requesterId?: string; guildId?: string; type?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
      const typeKey = args.type ? args.type.toLowerCase() : "";
      const filtered = Array.from(guild.channels.cache.values())
        .filter((ch: any) => {
          if (!typeKey) return true;
          const typeName = String(ChannelType[ch.type as keyof typeof ChannelType] ?? "").toLowerCase();
          return typeName === typeKey || typeName.replace("guild", "") === typeKey;
        })
        .slice(0, limit)
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          type: ChannelType[ch.type as keyof typeof ChannelType] ?? String(ch.type),
          typeId: ch.type,
          parentId: ch.parentId ?? null,
          topic: "topic" in ch ? ch.topic ?? null : null,
          nsfw: "nsfw" in ch ? Boolean(ch.nsfw) : false,
          position: typeof ch.rawPosition === "number" ? ch.rawPosition : null
        }));
      return { channels: filtered };
    },
    search_guild_channels: async (args: { requesterId?: string; guildId?: string; query?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.query) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const term = args.query.toLowerCase();
      const matches = Array.from(guild.channels.cache.values())
        .filter((ch: any) => String(ch.name || "").toLowerCase().includes(term))
        .slice(0, limit)
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          type: ChannelType[ch.type as keyof typeof ChannelType] ?? String(ch.type),
          typeId: ch.type,
          parentId: ch.parentId ?? null,
          topic: "topic" in ch ? ch.topic ?? null : null,
          nsfw: "nsfw" in ch ? Boolean(ch.nsfw) : false,
          position: typeof ch.rawPosition === "number" ? ch.rawPosition : null
        }));
      return { channels: matches };
    },
    get_channel_info: async (args: { requesterId?: string; guildId?: string; channelId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      return {
        channel: {
          id: channel.id,
          name: channel.name,
          type: ChannelType[channel.type as keyof typeof ChannelType] ?? String(channel.type),
          typeId: channel.type,
          parentId: channel.parentId ?? null,
          topic: "topic" in channel ? channel.topic ?? null : null,
          nsfw: "nsfw" in channel ? Boolean(channel.nsfw) : false,
          position: typeof channel.rawPosition === "number" ? channel.rawPosition : null,
          rateLimitPerUser: "rateLimitPerUser" in channel ? channel.rateLimitPerUser ?? null : null,
          bitrate: "bitrate" in channel ? channel.bitrate ?? null : null,
          userLimit: "userLimit" in channel ? channel.userLimit ?? null : null
        }
      };
    },
    create_guild_channel: async (args: { requesterId?: string; guildId?: string; name: string; type: string; parentId?: string; topic?: string; nsfw?: boolean; rateLimitPerUser?: number; bitrate?: number; userLimit?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.name || !args.type) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const typeKey = args.type.toLowerCase();
      const typeMap: Record<string, ChannelType> = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        category: ChannelType.GuildCategory,
        announcement: ChannelType.GuildAnnouncement,
        forum: ChannelType.GuildForum,
        stage: ChannelType.GuildStageVoice
      };
      const channelType = typeMap[typeKey] as any;
      if (!channelType) return { error: "Unsupported channel type" };
      const channel = await guild.channels.create({
        name: args.name,
        type: channelType,
        parent: args.parentId ?? null,
        topic: args.topic,
        nsfw: args.nsfw,
        rateLimitPerUser: args.rateLimitPerUser,
        bitrate: args.bitrate,
        userLimit: args.userLimit,
        reason: args.reason
      });
      return { channel: { id: channel.id, name: channel.name, type: channel.type } };
    },
    edit_guild_channel: async (args: { requesterId?: string; guildId?: string; channelId: string; name?: string; topic?: string; nsfw?: boolean; rateLimitPerUser?: number; parentId?: string; position?: number; userLimit?: number; bitrate?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const channel = guild.channels.cache.get(args.channelId);
      if (!channel) return { error: "Channel not found" };
      const updated = await channel.edit({
        name: args.name,
        topic: args.topic,
        nsfw: args.nsfw,
        rateLimitPerUser: args.rateLimitPerUser,
        parent: args.parentId ?? undefined,
        position: args.position,
        userLimit: args.userLimit,
        bitrate: args.bitrate,
        reason: args.reason
      });
      return { channel: { id: updated.id, name: updated.name, type: updated.type } };
    },
    delete_guild_channel: async (args: { requesterId?: string; guildId?: string; channelId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const channel = guild.channels.cache.get(args.channelId);
      if (!channel) return { error: "Channel not found" };
      await channel.delete(args.reason);
      return { success: true };
    },
    create_thread: async (args: { requesterId?: string; guildId?: string; channelId: string; name: string; type?: string; autoArchiveDuration?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.name) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const typeKey = (args.type ?? "public").toLowerCase();
      const requiredPerm = typeKey === "private" ? PermissionFlagsBits.CreatePrivateThreads : PermissionFlagsBits.CreatePublicThreads;
      const hasPerm = hasGuildPermission(member, requiredPerm);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.threads) return { error: "Channel does not support threads" };
      const threadTypeMap: Record<string, ChannelType> = {
        public: ChannelType.PublicThread,
        private: ChannelType.PrivateThread,
        announcement: ChannelType.AnnouncementThread
      };
      const threadType = threadTypeMap[typeKey];
      if (!threadType) return { error: "Unsupported thread type" };
      const thread = await channel.threads.create({
        name: args.name,
        autoArchiveDuration: args.autoArchiveDuration,
        type: threadType,
        reason: args.reason
      });
      return { thread: { id: thread.id, name: thread.name, type: thread.type } };
    },
    send_channel_message: async (args: { requesterId?: string; guildId?: string; channelId: string; content: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.content) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      const perms = channel.permissionsFor(member);
      const hasPerm = !!perms && perms.has(PermissionFlagsBits.SendMessages);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botPerms = channel.permissionsFor(guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) return { error: "Bot lacks SendMessages permission" };
      const sent = await channel.send({ content: args.content });
      return { message: { id: sent.id, channelId: sent.channelId } };
    },
    send_channel_embed: async (args: { requesterId?: string; guildId?: string; channelId: string; embed: any; content?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.embed) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      const perms = channel.permissionsFor(member);
      const hasPerm = !!perms && perms.has(PermissionFlagsBits.SendMessages);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botPerms = channel.permissionsFor(guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) return { error: "Bot lacks SendMessages permission" };
      const embedBuilder = new EmbedBuilder();
      if (args.embed.title) embedBuilder.setTitle(String(args.embed.title));
      if (args.embed.description) embedBuilder.setDescription(String(args.embed.description));
      if (args.embed.url) embedBuilder.setURL(String(args.embed.url));
      if (args.embed.timestamp) embedBuilder.setTimestamp(new Date(args.embed.timestamp));
      if (args.embed.footer?.text) embedBuilder.setFooter({ text: String(args.embed.footer.text), iconURL: args.embed.footer.icon_url ? String(args.embed.footer.icon_url) : undefined });
      if (args.embed.thumbnail) embedBuilder.setThumbnail(String(args.embed.thumbnail));
      if (args.embed.image) embedBuilder.setImage(String(args.embed.image));
      if (args.embed.author?.name) embedBuilder.setAuthor({ name: String(args.embed.author.name), iconURL: args.embed.author.icon_url ? String(args.embed.author.icon_url) : undefined, url: args.embed.author.url ? String(args.embed.author.url) : undefined });
      if (Array.isArray(args.embed.fields)) {
        embedBuilder.addFields(args.embed.fields.map((f: any) => ({ name: String(f.name), value: String(f.value), inline: !!f.inline })));
      }
      if (args.embed.color !== undefined && args.embed.color !== null) {
        if (typeof args.embed.color === "number") embedBuilder.setColor(args.embed.color);
        if (typeof args.embed.color === "string") {
          const hex = args.embed.color.startsWith("#") ? args.embed.color.slice(1) : args.embed.color;
          const num = parseInt(hex, 16);
          if (!Number.isNaN(num)) embedBuilder.setColor(num);
        }
      }
      const sent = await channel.send({ content: args.content ?? undefined, embeds: [embedBuilder] });
      return { message: { id: sent.id, channelId: sent.channelId } };
    },
    set_channel_permissions: async (args: { requesterId?: string; guildId?: string; channelId: string; targetId: string; allow?: string[]; deny?: string[] }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.targetId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      let allow: bigint | undefined;
      let deny: bigint | undefined;
      try {
        if (args.allow && args.allow.length > 0) allow = PermissionsBitField.resolve(args.allow as any);
        if (args.deny && args.deny.length > 0) deny = PermissionsBitField.resolve(args.deny as any);
      } catch {
        return { error: "Invalid permission names" };
      }
      await channel.permissionOverwrites.edit(args.targetId, { allow, deny });
      return { success: true };
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
      const data = await response.json() as any;
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
        const resultPromise = script.runInContext(context, { timeout: timeoutMs });
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
    },
    get_bot_statistics: async (args: { requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to view bot statistics" };
      const guilds = client.guilds.cache.size;
      const users = client.users.cache.size;
      const channels = client.channels.cache.size;
      const commands = data.bot.commands.size;
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const dbUsers: any = await db.query("SELECT COUNT(*) as count FROM discord_users");
      const dbGuilds: any = await db.query("SELECT COUNT(*) as count FROM guilds");
      const vipUsers: any = await db.query("SELECT COUNT(*) as count FROM vip_users WHERE end_date > ?", [Date.now()]);
      return {
        cache: { guilds, users, channels },
        commands,
        database: {
          users: dbUsers[0]?.count ?? 0,
          guilds: dbGuilds[0]?.count ?? 0,
          vipUsers: vipUsers[0]?.count ?? 0
        },
        uptime: Math.floor(uptime),
        memory: {
          heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.floor(memoryUsage.rss / 1024 / 1024)
        }
      };
    },
    check_database_health: async (args: { requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to check database health" };
      try {
        const start = Date.now();
        await db.query("SELECT 1");
        const latency = Date.now() - start;
        return { healthy: true, latency };
      } catch (error: any) {
        return { healthy: false, error: error.message };
      }
    },
    get_worker_pool_status: async (args: { requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to view worker pool status" };
      return {
        translate: {
          poolSize: TRANSLATE_WORKER_POOL_SIZE,
          status: "operational"
        },
        ratelimit: {
          poolSize: 1,
          status: "operational"
        }
      };
    },
    clear_translation_cache: async (args: { requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to clear cache" };
      const beforeSize = translationCache.size;
      translationCache.clear();
      pendingTranslations.clear();
      return { success: true, clearedEntries: beforeSize };
    },
    get_user_warnings: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const warnings: any = await db.query("SELECT * FROM global_warnings WHERE userid = ? ORDER BY createdAt DESC", [args.userId]);
      return { warnings: Array.isArray(warnings) ? warnings : [] };
    },
    get_warning_details: async (args: { warningId: number }): Promise<any> => {
      if (!args.warningId) return { error: "Missing warningId parameter" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ?", [args.warningId]);
      if (!warning || !warning[0]) return { error: "Warning not found" };
      return { warning: warning[0] };
    },
    appeal_warning: async (args: { userId: string; warningId: number; reason: string }): Promise<any> => {
      if (!args.userId || !args.warningId || !args.reason) return { error: "Missing parameters" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ? AND userid = ?", [args.warningId, args.userId]);
      if (!warning || !warning[0]) return { error: "Warning not found or does not belong to user" };
      if (warning[0].appealed) return { error: "Warning has already been appealed" };
      await db.query("UPDATE global_warnings SET appealed = TRUE, appeal_status = 'pending', appeal_reason = ? WHERE id = ?", [args.reason, args.warningId]);
      return { success: true };
    },
    get_pending_appeals: async (args: { requesterId?: string }): Promise<any> => {
      if (!args?.requesterId) return { error: "Missing requesterId parameter" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view appeals" };
      const appeals: any = await db.query("SELECT * FROM global_warnings WHERE appeal_status = 'pending' ORDER BY createdAt DESC");
      return { appeals: Array.isArray(appeals) ? appeals : [] };
    },
    review_appeal: async (args: { requesterId?: string; warningId: number; approved: boolean; reviewNote?: string }): Promise<any> => {
      if (!args?.requesterId || !args.warningId || args.approved === undefined) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to review appeals" };
      const warning: any = await db.query("SELECT * FROM global_warnings WHERE id = ?", [args.warningId]);
      if (!warning || !warning[0]) return { error: "Warning not found" };
      if (warning[0].appeal_status !== "pending") return { error: "Appeal is not pending review" };
      const status = args.approved ? "approved" : "rejected";
      const updates: any = {
        appeal_status: status,
        appeal_reviewed_by: args.requesterId,
        appeal_reviewed_at: Date.now()
      };
      if (args.approved) {
        updates.active = false;
      }
      await db.query("UPDATE global_warnings SET ? WHERE id = ?", [updates, args.warningId]);
      return { success: true, status };
    },
    global_ban_user: async (args: { requesterId?: string; userId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to ban users" };
      const existing: any = await db.query("SELECT * FROM global_bans WHERE id = ?", [args.userId]);
      if (existing && existing[0]) {
        await db.query("UPDATE global_bans SET active = TRUE, times = times + 1 WHERE id = ?", [args.userId]);
      } else {
        await db.query("INSERT INTO global_bans SET ?", [{ id: args.userId, active: true, times: 1 }]);
      }
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_ban",
        target_id: args.userId,
        details: args.reason ?? "No reason provided",
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_unban_user: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to unban users" };
      await db.query("UPDATE global_bans SET active = FALSE WHERE id = ?", [args.userId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_unban",
        target_id: args.userId,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_mute_user: async (args: { requesterId?: string; userId: string; duration?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to mute users" };
      const until = args.duration ? Date.now() + args.duration : 0;
      const existing: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [args.userId]);
      if (existing && existing[0]) {
        await db.query("UPDATE global_mutes SET until = ?, reason = ? WHERE id = ?", [until, args.reason ?? "No reason provided", args.userId]);
      } else {
        await db.query("INSERT INTO global_mutes SET ?", [{
          id: args.userId,
          reason: args.reason ?? "No reason provided",
          authorid: args.requesterId,
          createdAt: Date.now(),
          until
        }]);
      }
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_mute",
        target_id: args.userId,
        details: args.reason ?? "No reason provided",
        metadata: JSON.stringify({ duration: args.duration, until }),
        created_at: Date.now()
      }]);
      return { success: true };
    },
    global_unmute_user: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to unmute users" };
      await db.query("DELETE FROM global_mutes WHERE id = ?", [args.userId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "global_unmute",
        target_id: args.userId,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    get_global_ban_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const banned = await utils.isUserBlacklisted(args.userId);
      if (!banned) return { banned: false };
      const ban: any = await db.query("SELECT * FROM global_bans WHERE id = ? AND active = TRUE", [args.userId]);
      return { banned: true, times: ban[0]?.times ?? 0 };
    },
    get_global_mute_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const muted = await utils.isUserMuted(args.userId);
      if (!muted) return { muted: false };
      const mute: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [args.userId]);
      if (!mute || !mute[0]) return { muted: false };
      return {
        muted: true,
        reason: mute[0].reason,
        until: mute[0].until,
        permanent: !mute[0].until || mute[0].until === 0
      };
    },
    create_support_ticket: async (args: { userId: string; category?: string; priority?: string; initialMessage: string; guildId?: string }): Promise<any> => {
      if (!args.userId || !args.initialMessage) return { error: "Missing parameters" };
      try {
        const homeGuild = await client.guilds.fetch(data.bot.home_guild);
        if (!homeGuild) return { error: "Support system is not properly configured" };
        const category = homeGuild.channels.cache.get(data.bot.support_category);
        if (!category || category.type !== 4) return { error: "Support category not found" };
        let guildName = null;
        if (args.guildId) {
          const guild = client.guilds.cache.get(args.guildId);
          guildName = guild?.name ?? null;
        }
        let assignedStaff: string | null = null;
        try {
          const allStaffResult: any = await db.query("SELECT uid FROM staff");
          const staffIds = allStaffResult.map((s: any) => s.uid);
          if (staffIds.length > 0) {
            const statuses: any = await db.query("SELECT user_id FROM staff_status WHERE user_id IN (?) AND status IN ('online', 'available')", [staffIds]);
            const availableStaffIds = statuses.map((s: any) => s.user_id);
            if (availableStaffIds.length > 0) {
              const workloads: any = await db.query("SELECT assigned_to, COUNT(*) as count FROM support_tickets WHERE assigned_to IN (?) AND status = 'open' GROUP BY assigned_to", [availableStaffIds]);
              const workloadMap = new Map<string, number>();
              workloads.forEach((w: any) => workloadMap.set(w.assigned_to, w.count));
              let minWorkload = Infinity;
              for (const staffId of availableStaffIds) {
                const workload = workloadMap.get(staffId) || 0;
                if (workload < minWorkload) {
                  minWorkload = workload;
                  assignedStaff = staffId;
                }
              }
            }
          }
        } catch (error) {
          assignedStaff = null;
        }
        const createdAt = Date.now();
        const result: any = await db.query("INSERT INTO support_tickets SET ?", [{
          user_id: args.userId,
          channel_id: "pending",
          status: "open",
          priority: args.priority ?? "medium",
          category: args.category ?? "general",
          created_at: createdAt,
          initial_message: args.initialMessage,
          guild_id: args.guildId ?? null,
          guild_name: guildName,
          assigned_to: assignedStaff
        }]);
        const ticketId = result.insertId;
        const user = await client.users.fetch(args.userId);
        const channelName = `support-request-${ticketId}`;
        const ticketChannel = await homeGuild.channels.create({
          name: channelName,
          type: 0,
          parent: data.bot.support_category,
          topic: `Support ticket #${ticketId} - User: ${user.tag} (${args.userId})`
        });
        await db.query("UPDATE support_tickets SET channel_id = ? WHERE id = ?", [ticketChannel.id, ticketId]);
        await db.query("INSERT INTO support_messages SET ?", [{
          ticket_id: ticketId,
          user_id: args.userId,
          username: user.tag,
          content: args.initialMessage,
          timestamp: createdAt,
          is_staff: false,
          staff_rank: null
        }]);
        try {
          await user.send(`Your support ticket #${ticketId} has been created! Our staff will respond to you soon.`);
        } catch (error) {
          console.error("Failed to send ticket creation confirmation to user:", error);
        }
        return { success: true, ticketId, channelId: ticketChannel.id };
      } catch (error: any) {
        console.error("Support ticket creation error:", error);
        return { error: error.message ?? "Failed to create support ticket" };
      }
    },
    get_ticket_details: async (args: { ticketId: number }): Promise<any> => {
      if (!args.ticketId) return { error: "Missing ticketId parameter" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      return { ticket: ticket[0] };
    },
    get_user_tickets: async (args: { userId: string; status?: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let query = "SELECT * FROM support_tickets WHERE user_id = ?";
      const params: any[] = [args.userId];
      if (args.status) {
        query += " AND status = ?";
        params.push(args.status);
      }
      query += " ORDER BY created_at DESC";
      const tickets: any = await db.query(query, params);
      return { tickets: Array.isArray(tickets) ? tickets : [] };
    },
    assign_ticket: async (args: { requesterId?: string; ticketId: number; staffId: string }): Promise<any> => {
      if (!args?.requesterId || !args.ticketId || !args.staffId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to assign tickets" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      await db.query("UPDATE support_tickets SET assigned_to = ? WHERE id = ?", [args.staffId, args.ticketId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "assign_ticket",
        target_id: String(args.ticketId),
        details: `Assigned to ${args.staffId}`,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    close_ticket: async (args: { requesterId?: string; ticketId: number }): Promise<any> => {
      if (!args?.requesterId || !args.ticketId) return { error: "Missing parameters" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      if (ticket[0].user_id !== args.requesterId && !await utils.isStaff(args.requesterId)) {
        return { error: "Requester is not authorized to close this ticket" };
      }
      await db.query("UPDATE support_tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?", [Date.now(), args.requesterId, args.ticketId]);
      if (await utils.isStaff(args.requesterId)) {
        await db.query("INSERT INTO staff_audit_log SET ?", [{
          staff_id: args.requesterId,
          action_type: "close_ticket",
          target_id: String(args.ticketId),
          created_at: Date.now()
        }]);
      }
      return { success: true };
    },
    add_ticket_message: async (args: { ticketId: number; userId: string; username: string; content: string; isStaff?: boolean }): Promise<any> => {
      if (!args.ticketId || !args.userId || !args.username || !args.content) return { error: "Missing parameters" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      const staffRank = await utils.getUserStaffRank(args.userId);
      const message: any = {
        ticket_id: args.ticketId,
        user_id: args.userId,
        username: args.username,
        content: args.content,
        timestamp: Date.now(),
        is_staff: args.isStaff ?? false,
        staff_rank: staffRank
      };
      const result: any = await db.query("INSERT INTO support_messages SET ?", [message]);
      if (args.isStaff && !ticket[0].first_response_at) {
        await db.query("UPDATE support_tickets SET first_response_at = ?, first_response_by = ? WHERE id = ?", [Date.now(), args.userId, args.ticketId]);
      }
      return { success: true, messageId: result.insertId };
    },
    get_ticket_messages: async (args: { ticketId: number }): Promise<any> => {
      if (!args.ticketId) return { error: "Missing ticketId parameter" };
      const messages: any = await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [args.ticketId]);
      return { messages: Array.isArray(messages) ? messages : [] };
    },
    add_staff_note: async (args: { requesterId?: string; userId: string; note: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId || !args.note) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to add staff notes" };
      const noteData: any = {
        user_id: args.userId,
        staff_id: args.requesterId,
        note: args.note,
        created_at: Date.now()
      };
      const result: any = await db.query("INSERT INTO staff_notes SET ?", [noteData]);
      return { success: true, noteId: result.insertId };
    },
    get_staff_notes: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view staff notes" };
      const notes: any = await db.query("SELECT * FROM staff_notes WHERE user_id = ? ORDER BY created_at DESC", [args.userId]);
      return { notes: Array.isArray(notes) ? notes : [] };
    },
    update_staff_status: async (args: { requesterId?: string; status: string; statusMessage?: string }): Promise<any> => {
      if (!args?.requesterId || !args.status) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to update staff status" };
      const validStatuses = ["online", "busy", "away", "offline"];
      if (!validStatuses.includes(args.status)) return { error: "Invalid status" };
      const existing: any = await db.query("SELECT * FROM staff_status WHERE user_id = ?", [args.requesterId]);
      if (existing && existing[0]) {
        await db.query("UPDATE staff_status SET status = ?, status_message = ?, updated_at = ? WHERE user_id = ?", [args.status, args.statusMessage ?? null, Date.now(), args.requesterId]);
      } else {
        await db.query("INSERT INTO staff_status SET ?", [{
          user_id: args.requesterId,
          status: args.status,
          status_message: args.statusMessage ?? null,
          updated_at: Date.now()
        }]);
      }
      return { success: true };
    },
    get_staff_audit_log: async (args: { requesterId?: string; staffId?: string; actionType?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId) return { error: "Missing requesterId parameter" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view audit log" };
      let query = "SELECT * FROM staff_audit_log WHERE 1=1";
      const params: any[] = [];
      if (args.staffId) {
        query += " AND staff_id = ?";
        params.push(args.staffId);
      }
      if (args.actionType) {
        query += " AND action_type = ?";
        params.push(args.actionType);
      }
      query += " ORDER BY created_at DESC";
      if (args.limit && args.limit > 0) {
        query += " LIMIT ?";
        params.push(args.limit);
      } else {
        query += " LIMIT 50";
      }
      const logs: any = await db.query(query, params);
      return { logs: Array.isArray(logs) ? logs : [] };
    },
    get_rpg_character: async (args: { userId: string; accountId?: number }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let character: any;
      if (args.accountId) {
        character = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [args.accountId]);
      } else {
        character = await db.query("SELECT * FROM rpg_characters WHERE uid = ? ORDER BY created_at DESC LIMIT 1", [args.userId]);
      }
      if (!character || !character[0]) return { error: "Character not found" };
      return { character: character[0] };
    },
    get_rpg_inventory: async (args: { characterId: number }): Promise<any> => {
      if (!args.characterId) return { error: "Missing characterId parameter" };
      const inventory: any = await db.query(`
        SELECT i.*, item.name, item.description, item.type, item.rarity
        FROM rpg_inventory i
        JOIN rpg_items item ON i.item_id = item.id
        WHERE i.character_id = ?
        ORDER BY item.rarity, item.name
      `, [args.characterId]);
      return { inventory: Array.isArray(inventory) ? inventory : [] };
    },
    get_rpg_equipment: async (args: { characterId: number }): Promise<any> => {
      if (!args.characterId) return { error: "Missing characterId parameter" };
      const equipment: any = await db.query(`
        SELECT eq.*, ce.equipped_at
        FROM rpg_character_equipment ce
        JOIN rpg_equipment eq ON ce.equipment_id = eq.id
        WHERE ce.character_id = ?
      `, [args.characterId]);
      return { equipment: Array.isArray(equipment) ? equipment : [] };
    },
    get_rpg_session: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const session: any = await db.query("SELECT * FROM rpg_sessions WHERE uid = ? AND active = TRUE", [args.userId]);
      if (!session || !session[0]) return { active: false };
      return { active: true, session: session[0] };
    },
    get_rpg_account_status: async (args: { accountId: number }): Promise<any> => {
      if (!args.accountId) return { error: "Missing accountId parameter" };
      const status: any = await db.query("SELECT * FROM rpg_account_status WHERE account_id = ?", [args.accountId]);
      if (!status || !status[0]) return { frozen: false, banned: false };
      return { status: status[0] };
    },
    get_filter_config: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const config: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [args.guildId]);
      if (!config || !config[0]) return { error: "Filter config not found" };
      return { config: config[0] };
    },
    get_filter_words: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const words: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [args.guildId]);
      return { words: Array.isArray(words) ? words : [] };
    },
    get_custom_responses: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const responses: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [args.guildId]);
      return { responses: Array.isArray(responses) ? responses : [] };
    },
    get_globalchat_config: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const config: any = await db.query("SELECT guild, channel, enabled, banned, autotranslate, language FROM globalchats WHERE guild = ?", [args.guildId]);
      if (!config || !config[0]) return { error: "Global chat not configured for this guild" };
      return { config: config[0] };
    },
    get_command_list: async (): Promise<any> => {
      const commands = Array.from(data.bot.commands.values()).map((cmd: any) => ({
        name: cmd.data?.name,
        description: cmd.data?.description,
        category: cmd.category
      }));
      return { commands };
    },
    get_command_info: async (args: { commandName: string }): Promise<any> => {
      if (!args.commandName) return { error: "Missing commandName parameter" };
      const command: any = data.bot.commands.get(args.commandName);
      if (!command) return { error: "Command not found" };
      const options = command.data?.options?.map((opt: any) => ({
        name: opt.name,
        description: opt.description,
        type: opt.type,
        required: opt.required
      })) ?? [];
      return {
        name: command.data?.name,
        description: command.data?.description,
        category: command.category,
        options
      };
    },
    search_commands: async (args: { query: string }): Promise<any> => {
      if (!args.query) return { error: "Missing query parameter" };
      const searchTerm = args.query.toLowerCase();
      const commands = Array.from(data.bot.commands.values())
        .filter((cmd: any) =>
          cmd.data?.name?.toLowerCase().includes(searchTerm) ||
          cmd.data?.description?.toLowerCase().includes(searchTerm) ||
          cmd.category?.toLowerCase().includes(searchTerm)
        )
        .map((cmd: any) => ({
          name: cmd.data?.name,
          description: cmd.data?.description,
          category: cmd.category
        }));
      return { commands };
    },
    get_bot_features: async (): Promise<any> => {
      return {
        features: [
          "AI Chat & Voice Conversations",
          "Global Chat with Auto-Translation",
          "RPG System with Characters & Inventory",
          "Support Ticket System",
          "Custom Word Filters",
          "Staff Management & Audit Logs",
          "VIP System",
          "Custom Command Responses",
          "Global Moderation (Warnings, Bans, Mutes)",
          "User Notifications",
          "Email Integration",
          "AI Workspace for File Management",
          "Multi-language Support"
        ],
        supportServer: data.bot.home_guild,
        logChannel: data.bot.log_channel
      };
    },
    get_staff_permissions: async (args: { rankName?: string }): Promise<any> => {
      if (args.rankName) {
        const rank = StaffRanksManager.getRankByName(args.rankName);
        if (!rank) return { error: "Rank not found" };
        return { rank };
      }
      const ranks = data.bot.staff_ranks.map(r => ({
        name: r.name,
        hierarchy: r.hierarchy_position,
        permissions: r.permissions
      }));
      return { ranks };
    },
    check_vip_expiration: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const vip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [args.userId]);
      if (!vip || !vip[0]) return { isVip: false };
      const now = Date.now();
      const endDate = Number(vip[0].end_date);
      if (endDate < now) {
        return { isVip: false, expired: true, expiredAt: endDate };
      }
      const daysRemaining = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));
      return {
        isVip: true,
        startDate: vip[0].start_date,
        endDate: vip[0].end_date,
        daysRemaining
      };
    },
    get_system_info: async (args: { requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to view system info" };
      const mem = process.memoryUsage();
      return {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsed: Math.floor(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.floor(mem.heapTotal / 1024 / 1024),
          rss: Math.floor(mem.rss / 1024 / 1024)
        },
        cpuCount: Array.isArray(os.cpus()) ? os.cpus().length : null,
        cwd: PROJECT_ROOT
      };
    },
    list_project_files: async (args: { path?: string; recursive?: boolean; maxResults?: number } = {}): Promise<any> => {
      const directoryPath = resolveProjectPath(args.path ?? ".");
      const stats = await safeStat(directoryPath);
      if (!stats) return { error: "Path not found" };
      if (!stats.isDirectory()) return { error: "Target is not a directory" };
      const limit = Math.max(1, Math.min(args.maxResults ?? MAX_PROJECT_SCAN_RESULTS, MAX_PROJECT_SCAN_RESULTS));
      if (args.recursive) {
        const entries = await readDirectoryRecursive(directoryPath, limit, [], path.relative(PROJECT_ROOT, directoryPath) || "");
        return { entries };
      }
      const items = await fs.readdir(directoryPath, { withFileTypes: true });
      return {
        entries: items.map(item => ({
          path: path.join(path.relative(PROJECT_ROOT, directoryPath), item.name).replace(/\\/g, "/"),
          type: item.isDirectory() ? "directory" : "file"
        }))
      };
    },
    read_project_file_lines: async (args: { path: string; startLine?: number; endLine?: number }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const filePath = resolveProjectPath(args.path);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "File not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(lines.length, args.endLine ?? Math.min(start + 200, lines.length));
      const slice = lines.slice(start - 1, end);
      return {
        path: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/"),
        startLine: start,
        endLine: end,
        content: slice.join("\n")
      };
    },
    search_project_text: async (args: { query: string; path?: string; maxResults?: number }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const basePath = resolveProjectPath(args.path ?? ".");
      const stats = await safeStat(basePath);
      if (!stats) return { error: "Path not found" };
      const maxResults = Math.max(1, Math.min(args.maxResults ?? MAX_PROJECT_SCAN_RESULTS, MAX_PROJECT_SCAN_RESULTS));
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
          const fileMatches = await collectProjectSearchMatches(current, args.query, maxResults - matches.length);
          matches.push(...fileMatches);
        }
      }
      return { matches };
    },
    project_file_info: async (args: { path: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const target = resolveProjectPath(args.path);
      const stats = await safeStat(target);
      if (!stats) return { error: "Path not found" };
      return {
        info: {
          path: path.relative(PROJECT_ROOT, target).replace(/\\/g, "/"),
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          modified: stats.mtime.toISOString()
        }
      };
    },
    list_log_files: async (args: { maxResults?: number } = {}): Promise<any> => {
      const stats = await safeStat(LOGS_ROOT);
      if (!stats || !stats.isDirectory()) return { error: "Logs directory not found" };
      const limit = Math.max(1, Math.min(args.maxResults ?? 100, 500));
      const items = await fs.readdir(LOGS_ROOT, { withFileTypes: true });
      const files = items
        .filter(item => item.isFile())
        .slice(0, limit)
        .map(item => ({
          path: item.name,
          name: item.name
        }));
      return { files };
    },
    read_log_file_lines: async (args: { path: string; startLine?: number; endLine?: number }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const filePath = resolveLogsPath(args.path);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "Log file not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      const start = Math.max(1, args.startLine ?? Math.max(1, lines.length - MAX_LOG_READ_LINES + 1));
      const end = Math.min(lines.length, args.endLine ?? lines.length);
      const slice = lines.slice(start - 1, end);
      return {
        path: path.relative(LOGS_ROOT, filePath).replace(/\\/g, "/"),
        startLine: start,
        endLine: end,
        content: slice.join("\n")
      };
    },
    tail_log_file: async (args: { path: string; lines?: number }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const filePath = resolveLogsPath(args.path);
      const stats = await safeStat(filePath);
      if (!stats) return { error: "Log file not found" };
      if (!stats.isFile()) return { error: "Path is not a file" };
      const content = await fs.readFile(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      const count = Math.max(1, Math.min(args.lines ?? 200, MAX_LOG_READ_LINES));
      const slice = lines.slice(Math.max(0, lines.length - count));
      return {
        path: path.relative(LOGS_ROOT, filePath).replace(/\\/g, "/"),
        lines: slice.join("\n")
      };
    },
    search_logs: async (args: { query: string; file?: string; maxResults?: number }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const stats = await safeStat(LOGS_ROOT);
      if (!stats || !stats.isDirectory()) return { error: "Logs directory not found" };
      const maxResults = Math.max(1, Math.min(args.maxResults ?? 200, 500));
      const files = args.file ? [resolveLogsPath(args.file)] : (await fs.readdir(LOGS_ROOT)).map(f => path.join(LOGS_ROOT, f));
      const matches: { path: string; line: number; snippet: string }[] = [];
      for (const file of files) {
        if (matches.length >= maxResults) break;
        const fileStats = await safeStat(file);
        if (!fileStats || !fileStats.isFile()) continue;
        if (fileStats.size > MAX_FILE_SIZE_FOR_SEARCH) continue;
        const content = await fs.readFile(file, "utf8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(args.query.toLowerCase())) {
            matches.push({
              path: path.relative(LOGS_ROOT, file).replace(/\\/g, "/"),
              line: i + 1,
              snippet: lines[i].trim().slice(0, 200)
            });
            if (matches.length >= maxResults) break;
          }
        }
      }
      return { matches };
    },
    github_list_repo_dir: async (args: { path?: string; ref?: string }): Promise<any> => {
      const repoPath = args.path ? args.path.replace(/^\/+/, "") : "";
      const ref = args.ref ?? "master";
      const url = `https://api.github.com/repos/Barnie-Corps/barniebot/contents/${repoPath}?ref=${encodeURIComponent(ref)}`;
      const headers: Record<string, string> = {
        "User-Agent": "barniebot"
      };
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers });
      if (!response.ok) return { error: `GitHub request failed: ${response.status}` };
      const data = await response.json() as any;
      if (!Array.isArray(data)) return { error: "Path is not a directory" };
      return {
        entries: data.map((item: any) => ({
          path: item.path,
          type: item.type,
          size: item.size
        }))
      };
    },
    github_fetch_repo_file: async (args: { path: string; ref?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      const ref = args.ref ?? "master";
      const filePath = args.path.replace(/^\/+/, "");
      const url = `https://raw.githubusercontent.com/Barnie-Corps/barniebot/${encodeURIComponent(ref)}/${filePath}`;
      const headers: Record<string, string> = {
        "User-Agent": "barniebot"
      };
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers });
      if (!response.ok) return { error: `GitHub request failed: ${response.status}` };
      const content = await response.text();
      return { path: filePath, ref, content };
    },
    github_search_repo: async (args: { query: string; path?: string; filename?: string; limit?: number }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const repoQuery = [`${args.query} repo:Barnie-Corps/barniebot`];
      if (args.path) repoQuery.push(`path:${args.path}`);
      if (args.filename) repoQuery.push(`filename:${args.filename}`);
      const q = encodeURIComponent(repoQuery.join(" "));
      const url = `https://api.github.com/search/code?q=${q}`;
      const headers: Record<string, string> = {
        "User-Agent": "barniebot"
      };
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers });
      if (!response.ok) return { error: `GitHub search failed: ${response.status}` };
      const data = await response.json() as any;
      const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
      const items = Array.isArray(data.items) ? data.items.slice(0, limit) : [];
      return {
        totalCount: data.total_count ?? 0,
        items: items.map((item: any) => ({
          path: item.path,
          htmlUrl: item.html_url
        }))
      };
    },
    get_current_datetime: (): string => {
      return new Date().toISOString();
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
    // Circuit breaker check
    if (circuitBreakerOpen) {
      if (now - circuitBreakerLastFailure > CIRCUIT_BREAKER_TIMEOUT) {
        circuitBreakerOpen = false;
        circuitBreakerFailures = 0;
      } else {
        throw new Error("Translation service temporarily unavailable (circuit breaker open)");
      }
    }
    const task = (async () => {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= TRANSLATE_MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const delay = TRANSLATE_RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          let worker: WorkerHandle | null | undefined = Workers.getAvailableWorker(TRANSLATE_WORKER_TYPE);
          if (!worker) {
            worker = Workers.createWorker(TRANSLATE_WORKER_PATH, TRANSLATE_WORKER_TYPE) ?? undefined;
          }
          if (!worker) {
            worker = await Workers.AwaitAvailableWorker(TRANSLATE_WORKER_TYPE, TRANSLATE_TIMEOUT);
          }
          const messageId = Workers.postMessage(worker.id, { text, from, to: target });
          const response = await Workers.awaitResponse(worker.id, messageId, TRANSLATE_TIMEOUT);
          if (response.message?.error) throw new Error(response.message.error);
          const translatedText = String(response.message.translation ?? "");
          translationCache.set(cacheKey, { value: translatedText, expires: Date.now() + TRANSLATE_CACHE_TTL });
          trimTranslationCache();
          // Success - reset circuit breaker
          if (circuitBreakerFailures > 0) {
            circuitBreakerFailures = Math.max(0, circuitBreakerFailures - 1);
          }
          return translatedText;
        } catch (error: any) {
          lastError = error;
          if (attempt === TRANSLATE_MAX_RETRIES) {
            circuitBreakerFailures++;
            circuitBreakerLastFailure = Date.now();
            if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
              circuitBreakerOpen = true;
              Log.warn("Translation circuit breaker opened", { failures: circuitBreakerFailures });
            }
          }
        }
      }
      throw lastError || new Error("Translation failed after retries");
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
  processRateLimitsWorker,
  // --- Staff utilities ---
  getStaffRanks: (): Array<string> => [
    ...data.bot.staff_ranks.map(r => r.name)
  ],
  getStaffRankIndex: (rank?: string | null): number => {
    return StaffRanksManager.getRankHierarchyByName(rank ?? null);
  },
  getRankSuffix: (rank?: string | null): string => {
    if (!rank) return "";
    const map: Record<string, string> = {
      "Trial Support": "Trial SUPPORT",
      "Support": "SUPPORT",
      "Intern": "INTERN",
      "Trial Moderator": "Trial MOD",
      "Moderator": "MOD",
      "Senior Moderator": "SR MOD",
      "Chief of Moderation": "CoM",
      "Probationary Administrator": "pADMIN",
      "Administrator": "ADMIN",
      "Head Administrator": "Head ADMIN",
      "Chief of Staff": "CoS",
      "Co-Owner": "Co-OWNER",
      "Owner": "OWNER"
    };
    return map[rank] ?? rank.toUpperCase();
  },
  sanitizeStaffImpersonation: (name: string): string => {
    const pattern = /^\[(TRIAL\s+SUPPORT|SUPPORT|INTERN|TRIAL\s+MOD|MOD|SR\s+MOD|COM|PADMIN|HEAD\s+ADMIN|ADMIN|COS|CO-OWNER|OWNER)\]\s*/i;
    let sanitized = name;
    let guard = 0;
    while (pattern.test(sanitized) && guard < 5) {
      sanitized = sanitized.replace(pattern, "");
      guard++;
    }
    return sanitized.trim();
  },
  getUserStaffRank: async (userId: string): Promise<string | null> => {
    if (data.bot.owners.includes(userId)) return "Owner";
    const res: any = await db.query("SELECT hierarchy_position FROM staff WHERE uid = ?", [userId]);
    if (Array.isArray(res) && res[0]?.hierarchy_position !== undefined) {
      const hierarchy = Number(res[0].hierarchy_position);
      const rankData = StaffRanksManager.getRankByHierarchy(hierarchy);
      return rankData ? rankData.name : null;
    }
    return null;
  },
  setUserStaffRank: async (userId: string, rank: string | null): Promise<void> => {
    if (!rank) {
      await db.query("DELETE FROM staff WHERE uid = ?", [userId]);
      return;
    }
    const hierarchy = StaffRanksManager.getRankHierarchyByName(rank);
    const rankData = StaffRanksManager.getRankByName(rank);
    const rankName = rankData ? rankData.name : rank;
    const existing: any = await db.query("SELECT * FROM staff WHERE uid = ?", [userId]);
    if (existing?.length) await db.query("UPDATE staff SET ? WHERE uid = ?", [{ rank: rankName, hierarchy_position: hierarchy }, userId]);
    else await db.query("INSERT INTO staff SET ?", [{ uid: userId, rank: rankName, hierarchy_position: hierarchy }]);
  },
  // Blacklist / mute helpers for global chat
  isUserBlacklisted: async (userId: string): Promise<boolean> => {
    const res: any = await db.query("SELECT * FROM global_bans WHERE id = ? AND active = TRUE", [userId]);
    return Array.isArray(res) && res.length > 0;
  },
  isUserMuted: async (userId: string): Promise<boolean> => {
    const now = Date.now();
    const res: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [userId]);
    if (!Array.isArray(res) || !res[0]) return false;
    const mute = res[0];
    if (mute.until && Number(mute.until) > 0) {
      if (now >= Number(mute.until)) {
        await db.query("DELETE FROM global_mutes WHERE id = ?", [userId]);
        return false;
      }
    }
    return true;
  },
  /**
   * Parallel translation for nested objects with breadth-first batching.
   * Avoids deep recursion blocking and maximizes concurrency across available workers.
   */
  hasPermission: (rank: string | null, permission: string): boolean => {
    return StaffRanksManager.hasPermission(rank, permission);
  },
  hasMinimumRank: (userRank: string | null, minimumRank: string): boolean => {
    return StaffRanksManager.hasMinimumRank(userRank, minimumRank);
  },
  getStaffRankByHierarchy: (hierarchy: number) => {
    return StaffRanksManager.getRankByHierarchy(hierarchy);
  },
  getStaffRankByName: (name: string) => {
    return StaffRanksManager.getRankByName(name);
  },
  autoTranslateParallel: async (obj: any, language: string, target: string): Promise<typeof obj> => {
    if (typeof obj !== "object" || Array.isArray(obj)) throw new TypeError(`autoTranslateParallel expects an object, got ${Array.isArray(obj) ? "Array" : typeof obj}`);
    if (typeof language !== "string") throw new TypeError(`autoTranslateParallel expects language as string, got ${typeof language}`);
    const root = { ...obj };
    const queue: { path: string[]; value: any }[] = [{ path: [], value: root }];
    const translateTasks: Array<Promise<void>> = [];
    const assign = (container: any, path: string[], newValue: any) => {
      let current = container;
      for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
      current[path[path.length - 1]] = newValue;
    };
    while (queue.length) {
      const batchSize = queue.length;
      const batch: { path: string[]; value: any }[] = [];
      for (let i = 0; i < batchSize; i++) batch.push(queue.shift()!);
      for (const item of batch) {
        const val = item.value;
        if (typeof val !== "object" || Array.isArray(val)) continue;
        for (const [k, v] of Object.entries(val)) {
          if (typeof v === "string") {
            // Schedule translation
            translateTasks.push((async () => {
              try {
                const translated = await utils.translate(v, language, target);
                assign(root, [...item.path, k], translated.text);
              } catch (e) {
                // Fallback: keep original if translation fails
              }
            })());
          } else if (typeof v === "object" && !Array.isArray(v)) {
            queue.push({ path: [...item.path, k], value: v });
          }
        }
      }
    }
    if (translateTasks.length) await Promise.allSettled(translateTasks);
    return root;
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
    return Buffer.from(iv).toString('hex') + ":" + crypted;
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
  getAiResponse: async (prompt: string, chat: NIMChatSession) => {
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
  },
  getUnreadNotifications: async (userId: string): Promise<any[]> => {
    const notifications: any = await db.query(`
      SELECT gn.* FROM global_notifications gn
      WHERE NOT EXISTS (
        SELECT 1 FROM user_notification_reads unr
        WHERE unr.notification_id = gn.id AND unr.user_id = ?
      )
      ORDER BY gn.created_at DESC
    `, [userId]);
    return Array.isArray(notifications) ? notifications : [];
  },
  markNotificationRead: async (userId: string, notificationId: number): Promise<void> => {
    await db.query("INSERT IGNORE INTO user_notification_reads SET ?", [{
      user_id: userId,
      notification_id: notificationId,
      read_at: Date.now()
    }]);
  },
  safeInteractionRespond: async (interaction: any, payload: any) => {
    try {
      if (interaction.replied || interaction.deferred) return await interaction.editReply(payload);
      if (typeof payload === "object" && !payload.content) payload.content = "";
      return await interaction.reply(payload);
    } catch (err: any) {
      if (err?.code === 10008) {
        try { return await interaction.followUp(payload); } catch { }
      }
      throw err;
    }
  },
  safeComponentUpdate: async (i: any, payload: any) => {
    try {
      return await i.update(payload);
    } catch (err: any) {
      if (err?.code === 10008) {
        try { return await i.followUp(payload); } catch { }
      }
      throw err;
    }
  },
  isStaff(uid: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const rank = await utils.getUserStaffRank(uid);
      resolve(rank !== null);
    });
  },
};
export default utils;
