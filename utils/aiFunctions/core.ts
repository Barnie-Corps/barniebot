// AI-callable tool implementations: User data, ownership checks, account lookups, and knowledge search.
import { assertPublicUrl, buildSnippetFromTerms, canAccessKnowledge, chunkText, decryptText, encryptText, fetchUrlSafe, isOwner, loadKnowledgeCache, loadProjectKnowledgeCache, scoreHybridChunk, tokenizeSearchText } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import data from "../../data";
import Log from "../../Log";
import NVIDIAModels from "../../NVIDIAModels";
import type { DiscordUser, UserLanguage, AIMemory, KnowledgeSource } from "../../types/interfaces";

const coreFunctions = {
    list_knowledge_sources: async (args: { requesterId?: string } = {}): Promise<any> => {
      const cache = await loadKnowledgeCache();
      const visible: KnowledgeSource[] = [];
      for (const source of cache.sources) {
        if (await canAccessKnowledge(source.access, args.requesterId)) visible.push(source);
      }
      return { sources: visible.map(s => ({ id: s.id, title: s.title, tags: s.tags ?? [], access: s.access ?? "public" })) };
    },
    search_knowledge: async (args: { query: string; limit?: number; requesterId?: string; includeProjectDocs?: boolean }): Promise<any> => {
      if (!args?.query) return { error: "Missing query parameter" };
      const cache = await loadKnowledgeCache();
      const query = String(args.query).trim();
      if (!query) return { error: "Missing query parameter" };
      const terms = tokenizeSearchText(query, 2, 16);
      const limit = Math.max(1, Math.min(args.limit ?? 6, 12));
      const results: any[] = [];
      for (const source of cache.sources) {
        if (!(await canAccessKnowledge(source.access, args.requesterId))) continue;
        const content = cache.contents.get(source.id) ?? "";
        const chunks = chunkText(content);
        for (const chunk of chunks) {
          const score = scoreHybridChunk(chunk, query, terms, source.tags ?? [], source.title);
          if (score <= 0) continue;
          results.push({
            sourceId: source.id,
            title: source.title,
            score,
            snippet: buildSnippetFromTerms(chunk, terms),
            tags: source.tags ?? [],
            access: source.access ?? "public",
            origin: "knowledge"
          });
        }
      }
      const includeProjectDocs = args.includeProjectDocs !== false;
      if (includeProjectDocs) {
        const projectCache = await loadProjectKnowledgeCache();
        for (const doc of projectCache.docs) {
          const chunks = chunkText(doc.content);
          for (const chunk of chunks) {
            const score = scoreHybridChunk(chunk, query, terms, doc.tags, doc.title) * 0.95;
            if (score <= 0) continue;
            results.push({
              sourceId: doc.id,
              title: doc.title,
              score,
              snippet: buildSnippetFromTerms(chunk, terms),
              tags: doc.tags,
              access: "public",
              origin: "project",
              path: doc.path
            });
          }
        }
      }
      results.sort((a, b) => b.score - a.score);
      const deduped: any[] = [];
      const seen = new Set<string>();
      for (const result of results) {
        const key = `${result.sourceId}:${result.snippet}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(result);
        if (deduped.length >= limit) break;
      }
      return { query, results: deduped };
    },
    get_knowledge_source: async (args: { sourceId: string; requesterId?: string }): Promise<any> => {
      if (!args?.sourceId) return { error: "Missing sourceId parameter" };
      const cache = await loadKnowledgeCache();
      const source = cache.sources.find(s => s.id === args.sourceId);
      if (!source) return { error: "Source not found" };
      if (!(await canAccessKnowledge(source.access, args.requesterId))) return { error: "Requester is not authorized" };
      const content = cache.contents.get(source.id) ?? "";
      return { source: { id: source.id, title: source.title, tags: source.tags ?? [], access: source.access ?? "public" }, content };
    },
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
      return await fetchUrlSafe({ url: args.url });
    },
    api_request: async (args: { method: string; url: string; headers?: Record<string, string>; body?: string; query?: Record<string, string> }): Promise<any> => {
      const method = (args.method || "").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH"].includes(method)) return { error: "Unsupported method. Use GET, POST, PUT, or PATCH." };
      if (!args.url) return { error: "Missing url parameter" };
      let parsed: URL;
      try { parsed = await assertPublicUrl(args.url); } catch (error: any) { return { error: error?.message || "Invalid URL" }; }
      if (args.query && typeof args.query === "object") {
        for (const [k, v] of Object.entries(args.query)) parsed.searchParams.set(k, String(v));
      }
      const maxResponseBytes = 100 * 1024;
      const timeoutMs = 10000;
      let lastUrl = parsed.toString();
      let redirects = 0;
      const maxRedirects = 5;
      while (true) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const fetchOpts: RequestInit = { method, redirect: "manual", headers: args.headers || {}, signal: controller.signal as any };
          if (["POST", "PUT", "PATCH"].includes(method) && args.body !== undefined) fetchOpts.body = args.body;
          const response = await fetch(lastUrl, fetchOpts);
          if (response.status >= 300 && response.status < 400) {
            clearTimeout(timer);
            if (redirects >= maxRedirects) return { error: "Too many redirects", status: response.status };
            const location = response.headers.get("location");
            if (!location) return { error: "Redirect without Location header", status: response.status };
            try {
              const redirectUrl = await assertPublicUrl(new URL(location, lastUrl).toString());
              lastUrl = redirectUrl.toString();
            } catch (error: any) {
              return { error: error?.message || "Redirect target is not allowed", status: response.status };
            }
            redirects++;
            continue;
          }
          clearTimeout(timer);
          const contentType = response.headers.get("content-type") || "";
          const rawBody = Buffer.from(await response.arrayBuffer());
          if (rawBody.length > maxResponseBytes) {
            const text = rawBody.toString("utf8").slice(0, maxResponseBytes);
            return { status: response.status, contentType, body: text, truncated: true };
          }
          return { status: response.status, contentType, body: rawBody.toString("utf8"), truncated: false };
        } catch (error: any) {
          clearTimeout(timer);
          return { error: error?.name === "AbortError" ? "Request timed out" : "Request failed" };
        }
      }
    },
    fetch_url_safe: (args: { url: string; maxChars?: number; timeoutMs?: number }) => fetchUrlSafe(args),
    generate_code: async (args: { prompt: string }): Promise<{ code?: string; reasoning?: string; error?: string }> => {
      const prompt = args?.prompt?.trim();
      if (!prompt) return { error: "Missing prompt parameter" };
      try {
        const response = await NVIDIAModels.GetModelChatResponse([
          { role: "user", content: prompt }
        ], 30000, "programming", false);
        return { code: response.content, reasoning: response.reasoning };
      } catch (error: any) {
        Log.error("Failed to generate code", error instanceof Error ? error : new Error(String(error)));
        return { error: "Failed to generate code" };
      }
    },
    retrieve_owners: (): string[] => {
      return data.bot.owners;
    },
    isOwner: (userId: string): boolean => {
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
      const decryptedMemories = memories.map((mem: any) => ({
        ...mem,
        memory: decryptText(mem.memory)
      }));
      return { memories: decryptedMemories };
    },
    insert_memory: async (args: { userId: string; memory: string }): Promise<any> => {
      if (!args.userId || !args.memory) return { error: "Missing parameters" };
      const encryptedMemory = encryptText(args.memory);
      await db.query("INSERT INTO ai_memories SET ?", [{ uid: args.userId, memory: encryptedMemory }]);
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
    execute_query: async (args: { query: string; requesterId?: string; }): Promise<any> => {
      if (!args.query) return { error: "Missing query parameter" };
      if (!isOwner(args.requesterId)) return { error: "Requester is not authorized to run database queries" };
      try {
        const result: any = await db.query(args.query);
        return { result };
      } catch (error: any) {
        return { error: error.message };
      }
    },
};

export default coreFunctions;
