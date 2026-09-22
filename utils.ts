import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import * as net from "net";
import { promises as dns } from "dns";
import Workers from "./Workers";
import type { WorkerHandle } from "./types/worker";
import StaffRanksManager from "./managers/StaffRanksManager";
import path from "path";
import db from "./mysql/database";
import type { NIMChatSession } from "./types/nvidia";
import NVIDIAModels from "./NVIDIAModels";
import * as nodemailer from "nodemailer";
import * as os from "os";
import Log from "./Log";
import langs from "langs";
import data from "./data";
import client, { manager } from ".";
import { promises as fs } from "fs";
import * as vm from "vm";
import { exec as execCallback } from "child_process";
import { promisify, inspect, TextDecoder, TextEncoder } from "util";
import * as mathjs from "mathjs";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, TextChannel, GuildScheduledEvent } from "discord.js";
import type { DiscordUser, UserLanguage, AIMemory, KnowledgeSource, KnowledgeCache, ProjectKnowledgeDoc, ProjectKnowledgeCache, AiChatTierStatus, RPGSession, RPGCharacter, PermissionCheckResult } from "./types/interfaces";
import cacheManager from "./managers/CacheManager";
import aiFunctionsImpl from "./utils/aiFunctions";
const TRANSLATE_WORKER_TYPE = "translate";
const TRANSLATE_WORKER_PATH = path.join(__dirname, "workers/translate.js");
export const TRANSLATE_WORKER_POOL_SIZE = (() => {
  const fromEnv = Number(process.env.TRANSLATE_WORKERS);
  if (!Number.isNaN(fromEnv) && fromEnv > 0) return Math.max(1, Math.min(16, fromEnv));
  const cores = Array.isArray(os.cpus()) ? os.cpus().length : 4;
  const isWindows = process.platform === "win32";
  return isWindows ? Math.max(2, Math.min(4, cores)) : Math.max(2, Math.min(8, Math.ceil(cores / 2)));
})();
const TRANSLATE_TIMEOUT = 15000;
const TRANSLATE_CACHE_TTL = 300000;
const TRANSLATE_MAX_RETRIES = 3;
const TRANSLATE_RETRY_BASE_DELAY = 1000;
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_TIMEOUT = 60000;
export const TRANSLATION_CACHE_PREFIX = "barniebot:local:utils:translation:";
const KNOWLEDGE_CACHE_KEY = "barniebot:local:utils:knowledge";
const PROJECT_KNOWLEDGE_CACHE_KEY = "barniebot:local:utils:project-knowledge";
export const pendingTranslations = new Map<string, Promise<string>>();

const USER_LANGUAGE_CACHE_TTL = 600000;
const USER_LANGUAGE_LOCAL_PREFIX = "barniebot:local:chat:lang:";
const USER_LANGUAGE_GLOBAL_PREFIX = "barniebot:chat:lang:";
const pendingUserLanguages = new Map<string, Promise<string>>();

export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const isPrivateIP = (ip: string): boolean => {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    if (lower.startsWith("::ffff:127.") || lower.startsWith("::ffff:10.") || lower.startsWith("::ffff:172.") || lower.startsWith("::ffff:192.168.")) return true;
    return false;
  }
  return false;
};
export const assertPublicUrl = async (rawUrl: string, redirectUrl?: string): Promise<URL> => {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl || rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) !== 0) {
    if (isPrivateIP(hostname)) throw new Error("Access to private network addresses is blocked");
    return parsed;
  }
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses.length) throw new Error("Could not resolve host");
    if (addresses.some((entry) => isPrivateIP(entry.address))) throw new Error("Access to private network addresses is blocked");
  } catch (error: any) {
    if (error?.message?.includes("Access to private network addresses is blocked")) throw error;
    throw new Error("Could not resolve host");
  }
  return parsed;
};

export const getUserLanguageCached = async (userId: string): Promise<string> => {
  if (!userId) return "en";
  const localCacheKey = `${USER_LANGUAGE_LOCAL_PREFIX}${userId}`;
  const localCached = cacheManager.getLocal<{ lang: string }>(localCacheKey);
  if (localCached?.lang) return localCached.lang;
  const inflight = pendingUserLanguages.get(userId);
  if (inflight) return inflight;
  const task = (async () => {
    const globalCacheKey = `${USER_LANGUAGE_GLOBAL_PREFIX}${userId}`;
    const globalCached = await cacheManager.get<{ lang: string }>(globalCacheKey);
    if (globalCached?.lang) {
      cacheManager.setLocal(localCacheKey, { lang: globalCached.lang }, USER_LANGUAGE_CACHE_TTL);
      return globalCached.lang;
    }
    const result: any = await db.query("SELECT * FROM languages WHERE userid = ?", [userId]);
    const language = typeof result?.[0]?.lang === "string" && result[0].lang ? result[0].lang : "en";
    cacheManager.setLocal(localCacheKey, { lang: language }, USER_LANGUAGE_CACHE_TTL);
    Promise.resolve(cacheManager.set(globalCacheKey, { lang: language }, USER_LANGUAGE_CACHE_TTL)).catch(() => { });
    return language;
  })();
  pendingUserLanguages.set(userId, task);
  try {
    return await task;
  } finally {
    pendingUserLanguages.delete(userId);
  }
};

export const invalidateUserLanguageCache = (userId: string): void => {
  if (!userId) return;
  cacheManager.deleteLocal(`${USER_LANGUAGE_LOCAL_PREFIX}${userId}`);
  Promise.resolve(cacheManager.delete(`${USER_LANGUAGE_GLOBAL_PREFIX}${userId}`)).catch(() => { });
};

const STAFF_RANK_CACHE_TTL = 300000;
const MODERATION_CACHE_TTL = 60000;
const STAFF_RANK_LOCAL_PREFIX = "barniebot:local:chat:rank:";
const STAFF_RANK_GLOBAL_PREFIX = "barniebot:chat:rank:";
const BLACKLIST_LOCAL_PREFIX = "barniebot:local:chat:blacklist:";
const BLACKLIST_GLOBAL_PREFIX = "barniebot:chat:blacklist:";
const MUTE_LOCAL_PREFIX = "barniebot:local:chat:mute:";
const MUTE_GLOBAL_PREFIX = "barniebot:chat:mute:";

export const getCachedUserStaffRank = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  const localCacheKey = `${STAFF_RANK_LOCAL_PREFIX}${userId}`;
  const localCached = cacheManager.getLocal<{ rank: string | null }>(localCacheKey);
  if (localCached && Object.prototype.hasOwnProperty.call(localCached, "rank")) return localCached.rank;
  const globalCacheKey = `${STAFF_RANK_GLOBAL_PREFIX}${userId}`;
  const globalCached = await cacheManager.get<{ rank: string | null }>(globalCacheKey);
  if (globalCached && Object.prototype.hasOwnProperty.call(globalCached, "rank")) {
    cacheManager.setLocal(localCacheKey, { rank: globalCached.rank }, STAFF_RANK_CACHE_TTL);
    return globalCached.rank;
  }
  let rank: string | null = null;
  if (data.bot.owners.includes(userId)) {
    rank = "Owner";
  } else {
    const res: any = await db.query("SELECT hierarchy_position FROM staff WHERE uid = ?", [userId]);
    if (Array.isArray(res) && res[0]?.hierarchy_position !== undefined) {
      const rankData = StaffRanksManager.getRankByHierarchy(Number(res[0].hierarchy_position));
      rank = rankData ? rankData.name : null;
    }
  }
  cacheManager.setLocal(localCacheKey, { rank }, STAFF_RANK_CACHE_TTL);
  Promise.resolve(cacheManager.set(globalCacheKey, { rank }, STAFF_RANK_CACHE_TTL)).catch(() => { });
  return rank;
};

export const isUserBlacklistedCached = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  const localCacheKey = `${BLACKLIST_LOCAL_PREFIX}${userId}`;
  const localCached = cacheManager.getLocal<{ value: boolean }>(localCacheKey);
  if (localCached && typeof localCached.value === "boolean") return localCached.value;
  const globalCacheKey = `${BLACKLIST_GLOBAL_PREFIX}${userId}`;
  const globalCached = await cacheManager.get<{ value: boolean }>(globalCacheKey);
  if (globalCached && typeof globalCached.value === "boolean") {
    cacheManager.setLocal(localCacheKey, { value: globalCached.value }, MODERATION_CACHE_TTL);
    return globalCached.value;
  }
  const res: any = await db.query("SELECT * FROM global_bans WHERE id = ? AND active = TRUE", [userId]);
  const value = Array.isArray(res) && res.length > 0;
  cacheManager.setLocal(localCacheKey, { value }, MODERATION_CACHE_TTL);
  Promise.resolve(cacheManager.set(globalCacheKey, { value }, MODERATION_CACHE_TTL)).catch(() => { });
  return value;
};

export const isUserMutedCached = async (userId: string): Promise<boolean> => {
  const now = Date.now();
  if (!userId) return false;
  const localCacheKey = `${MUTE_LOCAL_PREFIX}${userId}`;
  const localCached = cacheManager.getLocal<{ value: boolean; until: number }>(localCacheKey);
  if (localCached && typeof localCached.value === "boolean") {
    if (localCached.until > 0 && now >= localCached.until) {
      cacheManager.deleteLocal(localCacheKey);
      return false;
    }
    return localCached.value;
  }
  const globalCacheKey = `${MUTE_GLOBAL_PREFIX}${userId}`;
  const globalCached = await cacheManager.get<{ value: boolean; until: number }>(globalCacheKey);
  if (globalCached && typeof globalCached.value === "boolean") {
    const until = Number(globalCached.until) || 0;
    if (until > 0 && now >= until) {
      cacheManager.deleteLocal(localCacheKey);
      Promise.resolve(cacheManager.delete(globalCacheKey)).catch(() => { });
      return false;
    }
    cacheManager.setLocal(localCacheKey, { value: globalCached.value, until }, MODERATION_CACHE_TTL);
    return globalCached.value;
  }
  const res: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [userId]);
  let value = false;
  let until = 0;
  if (Array.isArray(res) && res[0]) {
    until = Number(res[0].until) || 0;
    if (until > 0 && now >= until) {
      Promise.resolve(db.query("DELETE FROM global_mutes WHERE id = ?", [userId])).catch(() => { });
      value = false;
    } else {
      value = true;
    }
  }
  cacheManager.setLocal(localCacheKey, { value, until }, MODERATION_CACHE_TTL);
  Promise.resolve(cacheManager.set(globalCacheKey, { value, until }, MODERATION_CACHE_TTL)).catch(() => { });
  return value;
};

export const invalidateStaffModCache = (userId: string): void => {
  if (!userId) return;
  cacheManager.deleteLocal([
    `${STAFF_RANK_LOCAL_PREFIX}${userId}`,
    `${BLACKLIST_LOCAL_PREFIX}${userId}`,
    `${MUTE_LOCAL_PREFIX}${userId}`
  ]);
  Promise.resolve(cacheManager.delete([
    `${STAFF_RANK_GLOBAL_PREFIX}${userId}`,
    `${BLACKLIST_GLOBAL_PREFIX}${userId}`,
    `${MUTE_GLOBAL_PREFIX}${userId}`
  ])).catch(() => { });
};

let circuitBreakerFailures = 0;
let circuitBreakerLastFailure = 0;
let circuitBreakerOpen = false;
export const PROJECT_ROOT = process.cwd();
export const LOGS_ROOT = path.join(PROJECT_ROOT, "logs");
export const AI_WORKSPACE_ROOT = path.join(__dirname, "ai_workspace");
const KNOWLEDGE_ROOT = path.join(PROJECT_ROOT, "knowledge");
const KNOWLEDGE_SOURCES_PATH = path.join(KNOWLEDGE_ROOT, "sources.json");
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;
const HYBRID_PROJECT_KNOWLEDGE_PATHS = [
  "knowledge/project_knowledge.md",
  "README.md",
  "usage_policy.md",
  "privacy.md",
  "SECURITY.md",
  "ai_rules.json"
];
export const MAX_WORKSPACE_SCAN_RESULTS = 50;
export const MAX_FILE_SIZE_FOR_SEARCH = 1024 * 1024;
export const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024; // 8MB, safe default for Discord without Nitro
export const MAX_PROJECT_SCAN_RESULTS = 200;
export const MAX_LOG_READ_LINES = 500;
export const execPromise = promisify(execCallback);
export const ALLOWED_SANDBOX_MODULES = new Map<string, unknown>([
  ["mathjs", mathjs]
]);
Workers.bulkCreateWorkers(TRANSLATE_WORKER_PATH, TRANSLATE_WORKER_TYPE, TRANSLATE_WORKER_POOL_SIZE);
void (async () => {
  try {
    await Workers.prewarmType(TRANSLATE_WORKER_TYPE, TRANSLATE_WORKER_POOL_SIZE, 1500);
  } catch { }
})();

function processRateLimitsWorker(users: Array<{ uid: string; time_left: number }>, limits: Array<{ uid: string; time_left: number; username: string }>, decrementMs = 1000) {
  const activeUsers: Array<{ uid: string; time_left: number }> = [];
  const expiredUsers: string[] = [];
  const seenUsers = new Map<string, number>();
  if (Array.isArray(users)) {
    for (const u of users) {
      if (!u || typeof u.uid !== "string") continue;
      const existing = seenUsers.get(u.uid);
      const tl = (typeof u.time_left === "number" ? u.time_left : 0) - decrementMs;
      if (existing !== undefined) {
        if (tl > existing) seenUsers.set(u.uid, tl);
        continue;
      }
      seenUsers.set(u.uid, tl);
    }
    for (const [uid, timeLeft] of seenUsers) {
      if (timeLeft <= 0) expiredUsers.push(uid);
      else activeUsers.push({ uid, time_left: timeLeft });
    }
  }
  const activeLimits: Array<{ uid: string; time_left: number; username: string }> = [];
  const expiredLimits: Array<{ uid: string; username: string }> = [];
  const seenLimits = new Map<string, { time_left: number; username: string }>();
  if (Array.isArray(limits)) {
    for (const l of limits) {
      if (!l || typeof l.uid !== "string") continue;
      const existing = seenLimits.get(l.uid);
      const tl = (typeof l.time_left === "number" ? l.time_left : 0) - decrementMs;
      const username = typeof l.username === "string" ? l.username : "Unknown";
      if (existing !== undefined) {
        if (tl > existing.time_left) seenLimits.set(l.uid, { time_left: tl, username });
        continue;
      }
      seenLimits.set(l.uid, { time_left: tl, username });
    }
    for (const [uid, data] of seenLimits) {
      if (data.time_left <= 0) expiredLimits.push({ uid, username: data.username });
      else activeLimits.push({ uid, time_left: data.time_left, username: data.username });
    }
  }
  return {
    users: { keep: activeUsers, expired: expiredUsers },
    limits: { keep: activeLimits, expired: expiredLimits }
  };
}
const isWithinRoot = (resolved: string, root: string): boolean => {
  return resolved === root || resolved.startsWith(root + path.sep);
};
export const resolveWorkspacePath = (targetPath = ".", userId?: string) => {
  const userWorkspace = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
  const resolved = path.resolve(userWorkspace, targetPath);
  if (!isWithinRoot(resolved, userWorkspace)) {
    throw new Error("Path escapes ai_workspace");
  }
  return resolved;
};
export const resolveProjectPath = (targetPath = ".") => {
  const resolved = path.resolve(PROJECT_ROOT, targetPath);
  if (!isWithinRoot(resolved, PROJECT_ROOT)) {
    throw new Error("Path escapes project root");
  }
  return resolved;
};
export const resolveLogsPath = (targetPath = ".") => {
  const resolved = path.resolve(LOGS_ROOT, targetPath);
  if (!isWithinRoot(resolved, LOGS_ROOT)) {
    throw new Error("Path escapes logs directory");
  }
  return resolved;
};

const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is not set");
  return crypto.scryptSync(key, "salt", 32);
};

const isBcryptPasswordHash = (value: string): boolean => /^\$2[aby]\$\d\d\$/.test(value);

const decryptWithAESLegacy = (key: string, data: string): string | null => {
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
};

const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

const verifyPassword = async (storedPassword: string, plainPassword: string): Promise<{ valid: boolean; migrated: boolean }> => {
  if (!storedPassword) return { valid: false, migrated: false };
  if (isBcryptPasswordHash(storedPassword)) {
    return { valid: await bcrypt.compare(plainPassword, storedPassword), migrated: false };
  }
  try {
    const legacy = decryptWithAESLegacy(data.bot.encryption_key, storedPassword);
    if (legacy === plainPassword) return { valid: true, migrated: true };
  } catch { }
  return { valid: storedPassword === plainPassword, migrated: false };
};

const recordDailyMetric = async (metricName: string, increment = 1, timestamp = Date.now()): Promise<void> => {
  if (!metricName) return;
  const metricDate = utils.getUtcDateKey(timestamp);
  await db.query("INSERT INTO daily_metrics SET ? ON DUPLICATE KEY UPDATE total = total + VALUES(total), updated_at = VALUES(updated_at)", [{
    metric_date: metricDate,
    metric_name: metricName,
    total: increment,
    updated_at: timestamp
  }]);
};

const recordDailyDistinctMetric = async (metricName: string, entityId: string, timestamp = Date.now()): Promise<void> => {
  if (!metricName || !entityId) return;
  const metricDate = utils.getUtcDateKey(timestamp);
  await db.query("INSERT IGNORE INTO daily_distinct_metrics SET ?", [{
    metric_date: metricDate,
    metric_name: metricName,
    entity_id: entityId,
    updated_at: timestamp
  }]);
};

export const fetchUrlSafe = async (args: { url: string; maxChars?: number; timeoutMs?: number }): Promise<any> => {
  if (!args.url) return { error: "Missing url parameter" };
  let parsed: URL;
  try {
    parsed = await assertPublicUrl(args.url);
  } catch (error: any) {
    return { error: error?.message || "Invalid URL" };
  }
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
};

export const encryptText = (text: string): string => {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

export const decryptText = (encryptedData: string): string => {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) return encryptedData;
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

export const parseRelatedEntities = (value: string | null): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const escapeHtml = (value: any): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const closeSupportTicket = async (args: {
  ticketId: number;
  closedById: string;
  closedByLabel: string;
}): Promise<{ error: string } | { success: true; ticket: any; messageCount: number; durationText: string }> => {
  const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
  if (!ticketData || !ticketData[0]) return { error: "Ticket not found" };
  const ticket = ticketData[0];
  if (ticket.status === "closed") return { error: "Ticket is already closed" };

  const messages: any = await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [args.ticketId]);
  const user = await client.users.fetch(ticket.user_id);
  const closedAt = Date.now();

  const durationMs = closedAt - Number(ticket.created_at || closedAt);
  const durationText = utils.formatDurationText(durationMs);

  let textTranscript = `Support Ticket #${args.ticketId} - Transcript\n`;
  textTranscript += `User: ${user.tag} (${user.id})\n`;
  textTranscript += `Created: ${new Date(Number(ticket.created_at)).toISOString()}\n`;
  textTranscript += `Closed: ${new Date(closedAt).toISOString()}\n`;
  textTranscript += `Duration: ${durationText}\n`;
  textTranscript += `Closed by: ${args.closedByLabel}\n`;
  textTranscript += `Origin: ${ticket.guild_id ? `Guild: ${ticket.guild_name} (${ticket.guild_id})` : "Direct Message"}\n`;
  textTranscript += `Initial Message: ${ticket.initial_message}\n`;
  textTranscript += `\n${"=".repeat(50)}\n\n`;

  for (const msg of messages) {
    const timestamp = new Date(msg.timestamp).toISOString();
    if (msg.is_staff) {
      const rankTag = utils.getRankSuffix(msg.staff_rank);
      textTranscript += `[${timestamp}] [${rankTag}] ${msg.username}: ${msg.content}\n`;
    } else {
      textTranscript += `[${timestamp}] ${msg.username}: ${msg.content}\n`;
    }
  }

  const htmlTemplate = await fs.readFile(path.join(process.cwd(), "transcript_placeholder.html"), "utf-8");
  let messagesHtml = "";
  for (const msg of messages) {
    const timestamp = new Date(msg.timestamp).toLocaleString();
    const initial = escapeHtml(msg.username?.charAt(0).toUpperCase());
    const username = escapeHtml(msg.username);
    const content = escapeHtml(msg.content).replace(/\n/g, "<br>");
    if (msg.is_staff) {
      const rankTag = escapeHtml(utils.getRankSuffix(msg.staff_rank));
      messagesHtml += `
                            <div class="message">
                                <div class="avatar">${initial}</div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="username">${username}</span>
                                        <span class="staff-badge">${rankTag}</span>
                                        <span class="timestamp">${timestamp}</span>
                                    </div>
                                    <div class="message-text">${content}</div>
                                </div>
                            </div>`;
    } else {
      messagesHtml += `
                            <div class="message">
                                <div class="avatar">${initial}</div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="username">${username}</span>
                                        <span class="timestamp">${timestamp}</span>
                                    </div>
                                    <div class="message-text">${content}</div>
                                </div>
                            </div>`;
    }
  }

  const htmlContent = htmlTemplate
    .replace(/{ticketId}/g, String(args.ticketId))
    .replace(/{username}/g, escapeHtml(user.tag))
    .replace(/{userId}/g, escapeHtml(user.id))
    .replace(/{status}/g, "Closed")
    .replace(/{statusClass}/g, "status-closed")
    .replace(/{createdAt}/g, new Date(Number(ticket.created_at)).toLocaleString())
    .replace(/{closedAt}/g, new Date(closedAt).toLocaleString())
    .replace(/{origin}/g, ticket.guild_id ? `Guild: ${escapeHtml(ticket.guild_name)} (${ticket.guild_id})` : "Direct Message")
    .replace(/{initialMessage}/g, escapeHtml(ticket.initial_message) || "No initial message")
    .replace(/{messages}/g, messagesHtml);

  const textPath = path.join(process.cwd(), `transcript-${args.ticketId}.txt`);
  const htmlPath = path.join(process.cwd(), `transcript-${args.ticketId}.html`);
  await fs.writeFile(textPath, textTranscript);
  await fs.writeFile(htmlPath, htmlContent);

  const transcriptsChannel = await client.channels.fetch(data.bot.transcripts_channel) as TextChannel | null;
  if (transcriptsChannel) {
    const transcriptEmbed = new EmbedBuilder()
      .setColor("Purple")
      .setTitle(`🎫 Ticket #${args.ticketId} - Closed`)
      .setDescription(`Ticket closed by ${args.closedByLabel}`)
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: true },
        { name: "Messages", value: messages.length.toString(), inline: true },
        { name: "Duration", value: durationText, inline: true }
      )
      .setTimestamp();

    await transcriptsChannel.send({
      embeds: [transcriptEmbed],
      files: [
        { attachment: textPath, name: `transcript-${args.ticketId}.txt` },
        { attachment: htmlPath, name: `transcript-${args.ticketId}.html` }
      ]
    });
  }

  await db.query("UPDATE support_tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?", [closedAt, args.closedById, args.ticketId]);

  try {
    const ticketChannel = await client.channels.fetch(ticket.channel_id) as TextChannel | null;
    if (ticketChannel && ticket.message_id) {
      const originalMessage = await ticketChannel.messages.fetch(ticket.message_id);
      if (originalMessage?.embeds?.[0]) {
        const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
          .setColor("Red")
          .setTitle(`🔒 Ticket #${args.ticketId} - CLOSED`)
          .setFields(
            originalMessage.embeds[0].fields.map(field => {
              if (field.name.toLowerCase().includes("status")) {
                return { name: field.name, value: "Closed", inline: field.inline };
              }
              return field;
            })
          );
        await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
      }
    }
  } catch (error) {
    Log.error("Failed to update ticket embed:", error);
  }

  try {
    let closeTexts = {
      title: "🔒 Support Ticket Closed",
      description: `Your support ticket #${args.ticketId} has been closed by ${args.closedByLabel}.`,
      duration: "Duration",
      messages: "Messages",
      footer: "Thank you for contacting support!"
    };
    const ticketOwnerLang = await utils.getUserLanguage(ticket.user_id);
    if (ticketOwnerLang !== "en") {
      try { closeTexts = await utils.autoTranslate(closeTexts, "en", ticketOwnerLang); } catch { }
    }
    const closedEmbed = new EmbedBuilder()
      .setColor("Red")
      .setTitle(closeTexts.title)
      .setDescription(closeTexts.description)
      .addFields(
        { name: closeTexts.duration, value: durationText, inline: true },
        { name: closeTexts.messages, value: messages.length.toString(), inline: true }
      )
      .setFooter({ text: closeTexts.footer })
      .setTimestamp();
    await user.send({ embeds: [closedEmbed] });
  } catch (error) {
    Log.error("Failed to notify user of ticket closure:", error);
  }

  try {
    const ticketChannel = await client.channels.fetch(ticket.channel_id) as TextChannel | null;
    if (ticketChannel) {
      const closedNoticeEmbed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("🔒 Ticket Closed")
        .setDescription(`This ticket has been closed by ${args.closedByLabel}.\n\nTranscripts have been saved and sent to <#${data.bot.transcripts_channel}>.\n\nYou can delete this channel using the button below.`)
        .setTimestamp();

      const deleteButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_channel-${args.ticketId}`)
          .setLabel("Delete Channel")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️")
      );

      await ticketChannel.send({ embeds: [closedNoticeEmbed], components: [deleteButton] });
    }
  } catch (error) {
    Log.error("Failed to send ticket closed notice:", error);
  }

  await fs.unlink(textPath).catch(() => { });
  await fs.unlink(htmlPath).catch(() => { });

  return { success: true, ticket, messageCount: messages.length, durationText };
};

const resolveKnowledgePath = (source: KnowledgeSource): string => {
  return resolveProjectPath(source.path);
};
export const ensureWorkspaceExists = async (userId?: string) => {
  const workspacePath = userId ? path.join(AI_WORKSPACE_ROOT, userId) : AI_WORKSPACE_ROOT;
  await fs.mkdir(workspacePath, { recursive: true });
};
const ensureKnowledgeExists = async () => {
  await fs.mkdir(KNOWLEDGE_ROOT, { recursive: true });
};
export const safeStat = async (target: string) => {
  try {
    return await fs.stat(target);
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};
export const readDirectoryRecursive = async (dir: string, limit: number, results: any[] = [], prefix = "") => {
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
export const collectSearchMatches = async (filePath: string, query: string, maxMatches: number, workspaceRoot: string) => {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const matches: { path: string; line: number; snippet: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(query.toLowerCase())) {
      matches.push({
        path: filePath.replace(workspaceRoot + path.sep, "").replace(/\\/g, "/"),
        line: i + 1,
        snippet: lines[i].trim().slice(0, 200)
      });
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
};
export const collectProjectSearchMatches = async (filePath: string, query: string, maxMatches: number) => {
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
const loadKnowledgeSources = async (): Promise<KnowledgeSource[]> => {
  await ensureKnowledgeExists();
  const stats = await safeStat(KNOWLEDGE_SOURCES_PATH);
  if (!stats || !stats.isFile()) return [];
  const raw = await fs.readFile(KNOWLEDGE_SOURCES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((s: any) => s && typeof s.id === "string" && typeof s.path === "string");
};
export const loadKnowledgeCache = async (): Promise<KnowledgeCache> => {
  const cached = cacheManager.getLocal<KnowledgeCache>(KNOWLEDGE_CACHE_KEY);
  if (cached && Date.now() - cached.loadedAt < KNOWLEDGE_CACHE_TTL_MS) return cached;
  const now = Date.now();
  const sources = await loadKnowledgeSources();
  const contents = new Map<string, string>();
  for (const source of sources) {
    try {
      const content = await fs.readFile(resolveKnowledgePath(source), "utf8");
      contents.set(source.id, content);
    } catch {
      contents.set(source.id, "");
    }
  }
  const nextCache = { loadedAt: now, sources, contents };
  cacheManager.setLocal(KNOWLEDGE_CACHE_KEY, nextCache, KNOWLEDGE_CACHE_TTL_MS);
  return nextCache;
};
export const chunkText = (content: string, maxChars = 1200, overlap = 150): string[] => {
  if (!content) return [];
  const paragraphs = content.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const next = current ? `${current}\n\n${trimmed}` : trimmed;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    if (trimmed.length <= maxChars) {
      current = trimmed;
    } else {
      for (let i = 0; i < trimmed.length; i += maxChars - overlap) {
        chunks.push(trimmed.slice(i, i + maxChars));
      }
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
};
const normalizeSearchText = (value: string): string => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};
export const tokenizeSearchText = (value: string, minLength = 2, maxTerms = 24): string[] => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  const unique = new Set<string>();
  for (const token of normalized.split(" ")) {
    if (token.length < minLength) continue;
    unique.add(token);
    if (unique.size >= maxTerms) break;
  }
  return Array.from(unique);
};
const trigramSet = (value: string): Set<string> => {
  const compact = normalizeSearchText(value).replace(/\s+/g, "");
  const grams = new Set<string>();
  if (!compact) return grams;
  if (compact.length <= 3) {
    grams.add(compact);
    return grams;
  }
  for (let i = 0; i <= compact.length - 3; i++) {
    grams.add(compact.slice(i, i + 3));
  }
  return grams;
};
const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};
const scoreText = (text: string, terms: string[]): number => {
  if (!text || terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      score += 1;
      idx = lower.indexOf(term, idx + term.length);
    }
  }
  return score;
};
export const scoreHybridChunk = (chunk: string, query: string, terms: string[], sourceTags: string[] = [], sourceTitle = ""): number => {
  if (!chunk || !query) return 0;
  const normalizedChunk = normalizeSearchText(chunk);
  if (!normalizedChunk) return 0;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const lexicalScore = scoreText(normalizedChunk, terms);
  const matchedTerms = terms.filter(term => normalizedChunk.includes(term)).length;
  const termCoverage = terms.length > 0 ? matchedTerms / terms.length : 0;
  const phraseBonus = normalizedChunk.includes(normalizedQuery) ? 3 : 0;
  const chunkTrigrams = trigramSet(normalizedChunk.slice(0, 4000));
  const queryTrigrams = trigramSet(normalizedQuery);
  const semanticScore = jaccardSimilarity(chunkTrigrams, queryTrigrams) * 8;
  const tagBonus = sourceTags.reduce((acc, tag) => {
    const normalizedTag = normalizeSearchText(tag);
    if (!normalizedTag) return acc;
    if (normalizedQuery.includes(normalizedTag)) return acc + 0.6;
    if (terms.some(term => normalizedTag.includes(term) || term.includes(normalizedTag))) return acc + 0.4;
    return acc;
  }, 0);
  const titleBonus = (() => {
    const normalizedTitle = normalizeSearchText(sourceTitle);
    if (!normalizedTitle) return 0;
    if (normalizedTitle.includes(normalizedQuery)) return 1.2;
    const titleHits = terms.filter(term => normalizedTitle.includes(term)).length;
    return titleHits * 0.25;
  })();
  return lexicalScore + (termCoverage * 4) + phraseBonus + semanticScore + tagBonus + titleBonus;
};
const buildSnippet = (text: string, term: string, radius = 120): string => {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return text.slice(0, Math.min(text.length, 240));
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  return text.slice(start, end).trim();
};
export const buildSnippetFromTerms = (text: string, terms: string[], radius = 180): string => {
  if (!text) return "";
  const normalized = normalizeSearchText(text);
  const firstMatch = terms.find(term => normalized.includes(term));
  if (!firstMatch) return text.slice(0, Math.min(text.length, 360)).trim();
  return buildSnippet(text, firstMatch, radius);
};
export const loadProjectKnowledgeCache = async (): Promise<ProjectKnowledgeCache> => {
  const cached = cacheManager.getLocal<ProjectKnowledgeCache>(PROJECT_KNOWLEDGE_CACHE_KEY);
  if (cached && Date.now() - cached.loadedAt < KNOWLEDGE_CACHE_TTL_MS) return cached;
  const now = Date.now();
  const docs: ProjectKnowledgeDoc[] = [];
  for (const relativePath of HYBRID_PROJECT_KNOWLEDGE_PATHS) {
    const absolutePath = resolveProjectPath(relativePath);
    const stats = await safeStat(absolutePath);
    if (!stats || !stats.isFile() || stats.size > MAX_FILE_SIZE_FOR_SEARCH) continue;
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      docs.push({
        id: `project:${relativePath}`,
        path: relativePath.replace(/\\/g, "/"),
        title: path.basename(relativePath),
        tags: ["project", "docs"],
        content
      });
    } catch {
      continue;
    }
  }
  const nextCache = { loadedAt: now, docs };
  cacheManager.setLocal(PROJECT_KNOWLEDGE_CACHE_KEY, nextCache, KNOWLEDGE_CACHE_TTL_MS);
  return nextCache;
};
export const canAccessKnowledge = async (access: KnowledgeSource["access"], requesterId?: string) => {
  if (!access || access === "public") return true;
  if (!requesterId) return false;
  if (isOwner(requesterId) === true) return true;
  if (access === "owner") return false;
  const rank = await utils.getUserStaffRank(requesterId);
  return Boolean(rank);
};
export const isOwner = (userId: string | undefined | null): boolean => {
  if (!userId) return false;
  return data.bot.owners.includes(userId);
};
export const formatLogValue = (value: any): string => {
  if (typeof value === "string") return value;
  try {
    return inspect(value, { depth: 2, maxArrayLength: 20, breakLength: 120 });
  } catch (error) {
    return String(value);
  }
};
export const truncate = (value: string, limit = 4000): string => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…(truncated)`;
};
const parseToolCalls = (content: string): { cleanedText: string; toolCalls: Array<{ name: string; args: any }> } => {
  const toolCalls: Array<{ name: string; args: any }> = [];
  const beginTokens = [
    "<|tool_call_begin|>",
    "|tool_call_begin|",
    "<tool_call_begin>",
    "<tool_call>",
    "<|tool_call|>"
  ];
  const sepTokens = ["<|tool_sep|>", "|tool_sep|", "<tool_sep>"];
  const endTokens = [
    "<|tool_call_end|>",
    "|tool_call_end|",
    "<tool_call_end>",
    "</tool_call>",
    "</tool_call_end>"
  ];
  const callsBeginTokens = [
    "<|tool_calls_begin|>",
    "|tool_calls_begin|",
    "<tool_calls_begin>",
    "<|tool_calls|>"
  ];
  const callsEndTokens = [
    "<|tool_calls_end|>",
    "|tool_calls_end|",
    "<tool_calls_end>",
    "</tool_calls>",
    "</tool_calls_end>"
  ];
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
export const getGuildAndMember = async (guildId: string, userId: string) => {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { error: "Guild not found" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: "Member not found in guild" };
  return { guild, member };
};
export const isSystemRequester = (requesterId?: string | null) => requesterId === "__ai_monitor__";
export const isAdminStaffUser = async (userId: string) => {
  const rank = await utils.getUserStaffRank(userId);
  return StaffRanksManager.hasMinimumRank(rank, "Administrator");
};
export const hasGuildPermission = (member: any, permission: bigint) => {
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
const utils: any = {
  createArrows: (length: number): string => "^".repeat(length),
  parseToolCalls,
  escapeHtml,
  assertPublicUrl,
  closeSupportTicket,
  formatWelcomeMessage: (msg: string, userId: string, username: string, displayName: string, server: string, count: number): string => {
    return msg
      .replace(/\{user\}/g, `<@${userId}>`)
      .replace(/\{username\}/g, username)
      .replace(/\{displayname\}/g, displayName)
      .replace(/\{server\}/g, server)
      .replace(/\{count\}/g, String(count));
  },
  formatDurationText: (ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  },
  resolveGiveaway: async (giveawayId: number, language?: string): Promise<{ ok: boolean; error?: string; winners?: string[] }> => {
    const claimed: any = await db.query("UPDATE giveaways SET ended = TRUE WHERE id = ? AND ended = FALSE", [giveawayId]);
    if (!claimed || claimed.affectedRows !== 1) return { ok: false, error: "Giveaway not found or already ended" };
    const rows: any = await db.query("SELECT * FROM giveaways WHERE id = ?", [giveawayId]);
    const giveaway = rows?.[0];
    if (!giveaway) return { ok: false, error: "Giveaway not found" };
    const entries: any = await db.query("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?", [giveawayId]);
    const userIds = entries.map((e: any) => e.user_id);
    const winners: string[] = [];
    const pool = [...userIds];
    for (let i = 0; i < giveaway.winner_count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool[idx]);
      pool.splice(idx, 1);
    }
    await db.query("UPDATE giveaways SET winner_ids = ? WHERE id = ?", [JSON.stringify(winners), giveawayId]);

    try {
      const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null) as TextChannel | null;
      if (channel) {
        let texts = { endedAnnouncement: "🎊 Giveaway Ended!", won: "won", winnerLabel: "Winner(s)", noEntries: "No entries, couldn't pick a winner.", hosterLabel: "Hosted by" };
        const lang = (language || "en").toLowerCase();
        if (lang !== "en") {
          try { texts = await utils.autoTranslate(texts, "en", lang); } catch { }
        }
        const embed = new EmbedBuilder()
          .setColor("Green")
          .setTitle(`🎊 ${giveaway.prize}`)
          .setDescription(giveaway.description || "")
          .addFields(
            { name: texts.winnerLabel, value: winners.length > 0 ? winners.map((w: string) => `<@${w}>`).join(", ") : texts.noEntries, inline: true },
            { name: texts.hosterLabel, value: `<@${giveaway.created_by}>`, inline: true }
          )
          .setTimestamp();
        await channel.send({ content: winners.length > 0 ? `🎉 ${texts.endedAnnouncement} ${winners.map((w: string) => `<@${w}>`).join(", ")} ${texts.won} **${giveaway.prize}**!` : undefined, embeds: [embed] });
        const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
        if (msg) await msg.edit({ components: [] });
      }
    } catch (error: any) {
      Log.warn("Failed to announce giveaway end", { component: "Giveaway", giveawayId, error: error?.message || String(error) });
    }
    return { ok: true, winners };
  },
  rerollGiveawayWinner: async (giveawayId: number, guildId?: string, language?: string): Promise<{ ok: boolean; error?: string; newWinner?: string }> => {
    const rows: any = guildId
      ? await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [giveawayId, guildId])
      : await db.query("SELECT * FROM giveaways WHERE id = ?", [giveawayId]);
    const giveaway = rows?.[0];
    if (!giveaway) return { ok: false, error: "Giveaway not found" };
    if (!giveaway.ended) return { ok: false, error: "Giveaway is still running" };
    const entries: any = await db.query("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?", [giveawayId]);
    const userIds = entries.map((e: any) => e.user_id);
    let excluded: string[] = giveaway.winner_ids || [];
    if (typeof excluded === "string") {
      try { excluded = JSON.parse(excluded); } catch { excluded = []; }
    }
    const eligible = userIds.filter((uid: string) => !excluded.includes(uid));
    if (eligible.length === 0) return { ok: false, error: "No eligible entries to reroll" };
    const newWinner = eligible[Math.floor(Math.random() * eligible.length)];
    await db.query("UPDATE giveaways SET winner_ids = JSON_ARRAY_APPEND(IFNULL(winner_ids, '[]'), '$', ?) WHERE id = ?", [newWinner, giveawayId]);
    try {
      const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null) as TextChannel | null;
      if (channel) {
        let texts = { rerolled: "Winner rerolled!", newWinner: "New winner" };
        const lang = (language || "en").toLowerCase();
        if (lang !== "en") {
          try { texts = await utils.autoTranslate(texts, "en", lang); } catch { }
        }
        await channel.send(`🎉 **${texts.rerolled}** ${texts.newWinner}: <@${newWinner}>! ${giveaway.prize}`);
      }
    } catch (error: any) {
      Log.warn("Failed to announce giveaway reroll", { component: "Giveaway", giveawayId, error: error?.message || String(error) });
    }
    return { ok: true, newWinner };
  },
  formatBytes: (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  },
  resolveUsers: async (ids: Array<string | null | undefined>): Promise<Map<string, any>> => {
    const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
    const users = new Map<string, any>();
    const missing: string[] = [];
    for (const id of unique) {
      const cached = client.users.cache.get(id);
      if (cached) users.set(id, cached);
      else missing.push(id);
    }
    const resolved = await Promise.all(missing.map(id => client.users.fetch(id).catch(() => null)));
    for (let i = 0; i < missing.length; i++) {
      const u = resolved[i];
      if (u) users.set(missing[i], u);
    }
    return users;
  },
  extractSnowflakeIds: (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    const normalized = raw.trim().toLowerCase();
    if (!normalized || normalized === "none" || normalized === "clear") return [];
    return (raw.match(/\d{17,20}/g) || []).filter((value, index, array) => array.indexOf(value) === index);
  },
  parseDurationString: (str: string): number | null => {
    if (!/^(\d+[smhd])+$/.test(str)) return null;
    const parts = str.match(/\d+[smhd]/g);
    if (!parts) return null;
    const unitMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    let ms = 0;
    for (const part of parts) {
      const val = parseInt(part, 10);
      const unit = part.slice(-1);
      ms += val * unitMs[unit];
    }
    return ms;
  },
  AIFunctions: aiFunctionsImpl,
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
  getUserLanguage: getUserLanguageCached,
  invalidateUserLanguageCache,
  isValidLanguageCode: (code: string): boolean => {
    const c = String(code || "").trim().toLowerCase();
    if (c.length !== 2) return false;
    if (["ch", "br", "wa"].includes(c)) return false;
    return langs.has(1, c);
  },
  translate: async (text: string, from: string, target: string): Promise<any> => {
    const cacheKey = `${from}->${target}:${text}`;
    const fullCacheKey = `${TRANSLATION_CACHE_PREFIX}${cacheKey}`;
    const cached = cacheManager.getLocal<{ value: string }>(fullCacheKey);
    const now = Date.now();
    if (cached) return { text: cached.value };
    if (pendingTranslations.has(cacheKey)) {
      const shared = pendingTranslations.get(cacheKey) as Promise<string>;
      return { text: await shared };
    }
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
          cacheManager.setLocal(fullCacheKey, { value: translatedText }, TRANSLATE_CACHE_TTL);
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
  processRateLimitsWorker,
  getStaffRankIndex: (rank?: string | null): number => {
    return StaffRanksManager.getRankHierarchyByName(rank ?? null);
  },
  ensureStaff: (executorRank: string | null): PermissionCheckResult => {
    const idx = StaffRanksManager.getRankHierarchyByName(executorRank ?? null);
    if (idx < 0) return { ok: false, error: "You must be staff to use this command." };
    return { ok: true };
  },
  ensureAnyStaff: (executorRank: string | null): PermissionCheckResult => {
    const idx = StaffRanksManager.getRankHierarchyByName(executorRank ?? null);
    if (idx < 0) return { ok: false, error: "Insufficient permissions (staff only)." };
    return { ok: true };
  },
  ensureModPlus: (executorRank: string | null): PermissionCheckResult => {
    const idx = StaffRanksManager.getRankHierarchyByName(executorRank ?? null);
    const min = StaffRanksManager.getRankHierarchyByName("Moderator");
    if (idx < 0 || idx < min) return { ok: false, error: "Moderator rank or higher required." };
    return { ok: true };
  },
  ensureAdminPlus: (executorRank: string | null): PermissionCheckResult => {
    const idx = StaffRanksManager.getRankHierarchyByName(executorRank ?? null);
    const min = StaffRanksManager.getRankHierarchyByName("Probationary Administrator");
    if (idx < 0 || idx < min) return { ok: false, error: "Probationary Administrator rank or higher required." };
    return { ok: true };
  },
  ensureCoMPlus: (executorRank: string | null): PermissionCheckResult => {
    const idx = StaffRanksManager.getRankHierarchyByName(executorRank ?? null);
    const min = StaffRanksManager.getRankHierarchyByName("Chief of Moderation");
    if (idx < 0 || idx < min) return { ok: false, error: "Chief of Moderation rank or higher required." };
    return { ok: true };
  },
  checkWarningEscalation: async (userId: string, username: string, executorId: string): Promise<{ totalPoints: number; escalated: boolean; action?: "ban" | "mute" }> => {
    try {
      const result: any = await db.query(
        "SELECT COALESCE(SUM(points), 0) AS total FROM global_warnings WHERE userid = ? AND active = TRUE AND (appeal_status IS NULL OR appeal_status != 'approved') AND expires_at > ?",
        [userId, Date.now()]
      );
      const totalPoints = Number(result?.[0]?.total ?? 0);

      if (totalPoints >= 5) {
        await db.query("INSERT INTO global_bans (id, active, times) VALUES (?, TRUE, 1) ON DUPLICATE KEY UPDATE active = TRUE, times = times + 1", [userId]);
        utils.invalidateStaffModCache(userId);
        await manager.announce(`⚠️ **AUTO-BAN**: User \`${username}\` has been automatically blacklisted due to reaching ${totalPoints} warning points.`, "en");
        await utils.logStaffAction(executorId, "AUTO_BAN", userId, `Auto-banned ${username} for ${totalPoints} points`, { totalPoints, threshold: 5 });
        return { totalPoints, escalated: true, action: "ban" };
      }
      if (totalPoints >= 3) {
        const until = Date.now() + 24 * 60 * 60 * 1000;
        await db.query(
          "INSERT INTO global_mutes SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason), authorid = VALUES(authorid), createdAt = VALUES(createdAt), until = VALUES(until)",
          [{ id: userId, reason: "Automatic mute due to warning points", authorid: executorId, createdAt: Date.now(), until }]
        );
        utils.invalidateStaffModCache(userId);
        await manager.announce(`⚠️ **AUTO-MUTE**: User \`${username}\` has been automatically muted for 24h due to reaching ${totalPoints} warning points.`, "en");
        await utils.logStaffAction(executorId, "AUTO_MUTE", userId, `Auto-muted ${username} for 24h (${totalPoints} points)`, { totalPoints, threshold: 3, duration: "24h" });
        return { totalPoints, escalated: true, action: "mute" };
      }

      return { totalPoints, escalated: false };
    } catch (error) {
      Log.error("Failed to check warning escalation:", error);
      return { totalPoints: 0, escalated: false };
    }
  },
  logStaffAction: async (staffId: string, actionType: string, targetId: string | null, details: string, metadata?: any): Promise<void> => {
    try {
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: staffId,
        action_type: actionType,
        target_id: targetId,
        details: details,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: Date.now()
      }]);
    } catch (error) {
      Log.error("Failed to log staff action:", error);
    }
  },
  getRankSuffix: (rank?: string | null): string => {
    if (!rank) return "";
    const map: Record<string, string> = {
      "Trial Support": "TR SUPPORT",
      "Support": "SUPPORT",
      "Intern": "INTERN",
      "Trial Moderator": "TR MOD",
      "Moderator": "MOD",
      "Senior Moderator": "SR MOD",
      "Chief of Moderation": "CHIEF MOD",
      "Probationary Administrator": "PROB ADMIN",
      "Administrator": "ADMIN",
      "Head Administrator": "HEAD ADMIN",
      "Chief of Staff": "CHIEF STAFF",
      "Co-Owner": "CO-OWNER",
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
  getCachedUserStaffRank,
  isUserBlacklistedCached,
  isUserMutedCached,
  invalidateStaffModCache,
  setUserStaffRank: async (userId: string, rank: string | null): Promise<void> => {
    if (!rank) {
      await db.query("DELETE FROM staff WHERE uid = ?", [userId]);
      invalidateStaffModCache(userId);
      return;
    }
    const hierarchy = StaffRanksManager.getRankHierarchyByName(rank);
    const rankData = StaffRanksManager.getRankByName(rank);
    const rankName = rankData ? rankData.name : rank;
    const existing: any = await db.query("SELECT * FROM staff WHERE uid = ?", [userId]);
    if (existing?.length) await db.query("UPDATE staff SET ? WHERE uid = ?", [{ rank: rankName, hierarchy_position: hierarchy }, userId]);
    else await db.query("INSERT INTO staff SET ?", [{ uid: userId, rank: rankName, hierarchy_position: hierarchy }]);
    invalidateStaffModCache(userId);
  },
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
  autoTranslate: async (obj: any, language: string, target: string): Promise<typeof obj> => {
    if (typeof obj !== "object" || Array.isArray(obj)) throw new TypeError(`The autoTranslate function takes as first argument an object, got ${Array.isArray(obj) ? "Array" : typeof obj}`);
    if (typeof language !== "string") throw new TypeError(`The autoTranslate function takes as second argument a string, got ${typeof language}`);
    const keys = Object.keys(obj);
    const newObj = { ...obj };
    const validKeys: string[] = [];
    for (const k of keys) {
      if (typeof obj[k] === "object" && !Array.isArray(obj[k])) {
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
  /**
   * Parallel translation for nested objects with breadth-first batching.
   * Avoids deep recursion blocking and maximizes concurrency across available workers.
   */
  hasMinimumRank: (userRank: string | null, minimumRank: string): boolean => {
    return StaffRanksManager.hasMinimumRank(userRank, minimumRank);
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
            translateTasks.push((async () => {
              try {
                const translated = await utils.translate(v, language, target);
                assign(root, [...item.path, k], translated.text);
              } catch { }
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
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "base64") as crypto.CipherKey, iv);
    let crypted = cipher.update(data, "utf8", "hex");
    crypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${crypted}`;
  },
  decryptWithAES: (key: string, data: string): string | null => {
    const textParts = data.split(":");
    if (textParts.length === 3) {
      const [ivHex, authTagHex, encrypted] = textParts;
      if (!ivHex || !authTagHex || !encrypted) return null;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "base64") as crypto.CipherKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
    return decryptWithAESLegacy(key, data);
  },
  hashPassword,
  verifyPassword,
  isBcryptPasswordHash,
  recordDailyMetric,
  recordDailyDistinctMetric,
  isVIP: async (id: string) => {
    const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ? ORDER BY end_date DESC LIMIT 1", [id]);
    const row = foundVip?.[0];
    if (!row) return false;
    const endDate = Number(row.end_date ?? 0);
    if (endDate > 0 && endDate < Date.now()) return false;
    return true;
  },
  isPremiumGuild: async (guildId: string) => {
    const foundGuild: any = await db.query("SELECT * FROM vip_guilds WHERE guild_id = ? ORDER BY end_date DESC LIMIT 1", [guildId]);
    const row = foundGuild?.[0];
    if (!row) return false;
    const endDate = Number(row.end_date ?? 0);
    if (endDate > 0 && endDate < Date.now()) return false;
    return true;
  },
  isAdminStaff: async (userId: string) => {
    const rank = await utils.getUserStaffRank(userId);
    if (!rank) return false;
    return utils.hasMinimumRank(rank, "Administrator");
  },
  getUtcDateKey: (timestamp = Date.now()) => {
    return new Date(timestamp).toISOString().slice(0, 10);
  },
  getAiChatTierStatus: async (userId: string): Promise<AiChatTierStatus> => {
    if (data.bot.owners.includes(userId)) {
      return { tier: "owner", allowed: true, unlimited: true, dailyLimit: null, used: 0, remaining: null };
    }
    if (await utils.isStaff(userId)) {
      return { tier: "staff", allowed: true, unlimited: true, dailyLimit: null, used: 0, remaining: null };
    }
    if (await utils.isVIP(userId)) {
      return { tier: "vip", allowed: true, unlimited: true, dailyLimit: null, used: 0, remaining: null };
    }
    const usageDate = utils.getUtcDateKey();
    const rows: any = await db.query("SELECT messages_used FROM ai_chat_daily_usage WHERE user_id = ? AND usage_date = ? LIMIT 1", [userId, usageDate]);
    const used = Number(rows?.[0]?.messages_used ?? 0);
    const dailyLimit = 10;
    return {
      tier: "free",
      allowed: used < dailyLimit,
      unlimited: false,
      dailyLimit,
      used,
      remaining: Math.max(0, dailyLimit - used)
    };
  },
  consumeAiChatDailyQuota: async (userId: string): Promise<AiChatTierStatus> => {
    const status = await utils.getAiChatTierStatus(userId);
    if (status.unlimited) return status;
    if (!status.allowed) return status;
    const usageDate = utils.getUtcDateKey();
    const now = Date.now();
    const existing: any = await db.query("SELECT messages_used FROM ai_chat_daily_usage WHERE user_id = ? AND usage_date = ? LIMIT 1", [userId, usageDate]);
    if (existing?.[0]) {
      await db.query("UPDATE ai_chat_daily_usage SET messages_used = messages_used + 1, updated_at = ? WHERE user_id = ? AND usage_date = ?", [now, userId, usageDate]);
    } else {
      await db.query("INSERT INTO ai_chat_daily_usage SET ?", [{
        user_id: userId,
        usage_date: usageDate,
        messages_used: 1,
        updated_at: now
      }]);
    }
    await utils.recordDailyMetric("ai_chat_messages", 1, now);
    await utils.recordDailyDistinctMetric("ai_chat_users", userId, now);
    return await utils.getAiChatTierStatus(userId);
  },
  getAiResponse: async (prompt: string, chat: NIMChatSession) => {
    let result;
    try {
      result = await chat.sendMessage(prompt);
    } catch (error: any) {
      Log.error("Error getting AI response:", error);
      return { text: "Error: Could not get a response from the AI service. Please try again later.", call: null, toolCalls: [] };
    }
    const response = result.response;
    const text = response.text();
    const toolParse = parseToolCalls(text);
    const structuredCalls = response.functionCalls() ?? [];
    const callMap = new Map<string, { name: string; args: any }>();
    for (const call of structuredCalls) {
      callMap.set(`${call.name}:${JSON.stringify(call.args ?? {})}`, call);
    }
    for (const call of toolParse.toolCalls) {
      const key = `${call.name}:${JSON.stringify(call.args ?? {})}`;
      if (!callMap.has(key)) callMap.set(key, call);
    }
    const mergedCalls = Array.from(callMap.values());
    const cleanedText = toolParse.cleanedText || text;
    return { text: cleanedText, call: mergedCalls[0] ?? null, toolCalls: mergedCalls };
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
      if (interaction.replied || interaction.deferred) {
        if (typeof payload === "object" && !payload.content && payload.embeds) payload.content = "";
        return await interaction.editReply(payload);
      }
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
  sendLongTextResponse: async (target: any, text: string, notice: string, filenamePrefix = "response"): Promise<any> => {
    const filename = path.join(os.tmpdir(), `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.md`);
    await fs.writeFile(filename, String(text || ""), "utf8");
    try {
      if (typeof target?.reply === "function" && typeof target?.editReply === "function") {
        return await utils.safeInteractionRespond(target, { content: notice, files: [filename] });
      }
      if (typeof target?.reply === "function") {
        return await target.reply({ content: notice, files: [filename] });
      }
      if (typeof target?.send === "function") {
        return await target.send({ content: notice, files: [filename] });
      }
      throw new Error("Unsupported response target");
    } finally {
      try { await fs.unlink(filename); } catch { }
    }
  },
  getActiveRpgProfile: async (userId: string): Promise<{ session: RPGSession | null; character: RPGCharacter | null }> => {
    const sessionRows = await db.query(
      "SELECT s.*, a.username FROM rpg_sessions s JOIN registered_accounts a ON s.account_id = a.id WHERE s.uid = ? AND s.active = TRUE",
      [userId]
    ) as unknown as RPGSession[];
    const session = sessionRows[0] || null;
    if (!session) return { session: null, character: null };
    const characterRows = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [session.account_id]) as unknown as RPGCharacter[];
    return { session, character: characterRows[0] || null };
  },
  requireActiveRpgProfile: async (
    interaction: any,
    userId: string,
    messages: { notLoggedIn: string; noCharacter: string }
  ): Promise<{ session: RPGSession; character: RPGCharacter } | null> => {
    const profile = await utils.getActiveRpgProfile(userId);
    if (!profile.session) {
      await utils.safeInteractionRespond(interaction, { content: messages.notLoggedIn });
      return null;
    }
    if (!profile.character) {
      await utils.safeInteractionRespond(interaction, { content: messages.noCharacter });
      return null;
    }
    return { session: profile.session, character: profile.character };
  },
  isStaff(uid: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const rank = await utils.getUserStaffRank(uid);
      resolve(rank !== null);
    });
  },
  globalChatCacheKey: (guildId: string) => `barniebot:index:globalchat:${guildId}`,
  filterConfigCacheKey: (guildId: string) => `barniebot:index:filter:config:${guildId}`,
  filterWordsCacheKey: (guildId: string) => `barniebot:index:filter:words:${guildId}`,
  customResponsesCacheKey: (guildId: string) => `barniebot:index:customresponses:${guildId}`,
  async getGlobalChatConfigCached(guildId: string): Promise<any | null> {
    const key = utils.globalChatCacheKey(guildId);
    const cached = await cacheManager.get<any>(key);
    if (cached) return cached;
    const rows: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [guildId]);
    const first = rows?.[0] ?? null;
    await cacheManager.set(key, first, 15000);
    return first;
  },
  async getFilterConfigCached(guildId: string): Promise<any | null> {
    const key = utils.filterConfigCacheKey(guildId);
    const cached = await cacheManager.get<any>(key);
    if (cached) return cached;
    const rows: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [guildId]);
    const first = rows?.[0] ?? null;
    await cacheManager.set(key, first, 30000);
    return first;
  },
  async getFilterWordsCached(guildId: string): Promise<any[]> {
    const key = utils.filterWordsCacheKey(guildId);
    const cached = await cacheManager.get<any[]>(key);
    if (Array.isArray(cached)) return cached;
    const rows: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [guildId]);
    const list = Array.isArray(rows) ? rows : [];
    await cacheManager.set(key, list, 30000);
    return list;
  },
  async getCustomResponsesCached(guildId: string): Promise<any[]> {
    const key = utils.customResponsesCacheKey(guildId);
    const cached = await cacheManager.get<any[]>(key);
    if (Array.isArray(cached)) return cached;
    const rows: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [guildId]);
    const list = Array.isArray(rows) ? rows : [];
    await cacheManager.set(key, list, 30000);
    return list;
  },
  async invalidateFilterCaches(guildId: string): Promise<void> {
    await cacheManager.delete([utils.filterConfigCacheKey(guildId), utils.filterWordsCacheKey(guildId)]);
  },
};
export default utils;
