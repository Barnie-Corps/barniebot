import utils, { LOGS_ROOT, MAX_FILE_SIZE_FOR_SEARCH, MAX_LOG_READ_LINES, MAX_PROJECT_SCAN_RESULTS, PROJECT_ROOT, TRANSLATE_WORKER_POOL_SIZE, TRANSLATION_CACHE_PREFIX, collectProjectSearchMatches, isOwner, pendingTranslations, readDirectoryRecursive, resolveLogsPath, resolveProjectPath, safeStat } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import data from "../../data";
import path from "path";
import { promises as fs } from "fs";
import * as os from "os";
import cacheManager from "../../managers/CacheManager";
import StaffRanksManager from "../../managers/StaffRanksManager";

const diagnosticsFunctions = {
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
      const beforeSize = cacheManager.countLocalByPrefix(TRANSLATION_CACHE_PREFIX);
      cacheManager.deleteLocalByPrefix(TRANSLATION_CACHE_PREFIX);
      pendingTranslations.clear();
      return { success: true, clearedEntries: beforeSize };
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
    is_staff: async (args: { userId: string }): Promise<any> => {
      if (!args?.userId) return { error: "Missing userId parameter" };
      const rank = await utils.getUserStaffRank(args.userId);
      return { isStaff: rank !== null, rank };
    },
    get_user_staff_rank: async (args: { userId: string }): Promise<any> => {
      if (!args?.userId) return { error: "Missing userId parameter" };
      const rank = await utils.getUserStaffRank(args.userId);
      return { rank };
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
    list_project_files: async (args: { path?: string; recursive?: boolean; maxResults?: number; requesterId?: string } = {}): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to list project files" };
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
    read_project_file_lines: async (args: { path: string; startLine?: number; endLine?: number; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to read project files" };
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
    search_project_text: async (args: { query: string; path?: string; maxResults?: number; requesterId?: string }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to search project files" };
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
    project_file_info: async (args: { path: string; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to view project files" };
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
    list_log_files: async (args: { maxResults?: number; requesterId?: string } = {}): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to list log files" };
      const stats = await safeStat(LOGS_ROOT);
      if (!stats || !stats.isDirectory()) return { error: "Logs directory not found" };
      const limit = Math.max(1, Math.min(args.maxResults ?? 100, 500));
      const items = await fs.readdir(LOGS_ROOT, { withFileTypes: true });
      const fileStats = await Promise.all(items
        .filter(item => item.isFile())
        .map(async item => {
          const fullPath = path.join(LOGS_ROOT, item.name);
          const stat = await safeStat(fullPath);
          return {
            name: item.name,
            mtime: stat?.mtime?.getTime?.() ?? 0,
            size: stat?.size ?? 0
          };
        }));
      const files = fileStats
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map(item => ({
          path: item.name,
          name: item.name,
          size: item.size,
          modified: item.mtime ? new Date(item.mtime).toISOString() : null
        }));
      return { files };
    },
    read_log_file_lines: async (args: { path: string; startLine?: number; endLine?: number; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to read log files" };
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
    tail_log_file: async (args: { path: string; lines?: number; requesterId?: string }): Promise<any> => {
      if (!args?.path) return { error: "Missing path parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to read log files" };
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
    search_logs: async (args: { query: string; file?: string; maxResults?: number; requesterId?: string }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to search log files" };
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
    github_list_repo_dir: async (args: { path?: string; ref?: string; requesterId?: string }): Promise<any> => {
      if (!isOwner(args?.requesterId)) return { error: "Requester is not authorized to access the repository" };
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
};

export default diagnosticsFunctions;
