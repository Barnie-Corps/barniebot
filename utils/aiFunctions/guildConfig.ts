import db from "../../mysql/database";
import client from "../..";

const guildConfigFunctions = {
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
    get_filter_webhooks: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const channelIds = new Set(Array.from(guild.channels.cache.keys()));
      const webhooks: any = await db.query("SELECT id, token, channel FROM filter_webhooks");
      const scoped = Array.isArray(webhooks)
        ? webhooks.filter((row: any) => row && typeof row.channel === "string" && channelIds.has(row.channel))
        : [];
      return { webhooks: scoped };
    },
    get_custom_responses: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const responses: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [args.guildId]);
      return { responses: Array.isArray(responses) ? responses : [] };
    },
    get_custom_response: async (args: { guildId: string; command: string }): Promise<any> => {
      if (!args.guildId || !args.command) return { error: "Missing parameters" };
      const rows: any = await db.query("SELECT * FROM custom_responses WHERE guild = ? AND command = ?", [args.guildId, args.command]);
      if (!rows || !rows[0]) return { error: "Custom response not found" };
      return { response: rows[0] };
    },
    search_custom_responses: async (args: { guildId: string; query: string; limit?: number }): Promise<any> => {
      if (!args.guildId || !args.query) return { error: "Missing parameters" };
      const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
      const rows: any = await db.query(
        "SELECT * FROM custom_responses WHERE guild = ? AND (command LIKE ? OR response LIKE ?) LIMIT ?",
        [args.guildId, `%${args.query}%`, `%${args.query}%`, limit]
      );
      return { responses: Array.isArray(rows) ? rows : [] };
    },
    get_globalchat_config: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const config: any = await db.query("SELECT guild, channel, enabled, banned, autotranslate, language FROM globalchats WHERE guild = ?", [args.guildId]);
      if (!config || !config[0]) return { error: "Global chat not configured for this guild" };
      return { config: config[0] };
    },
    get_ai_monitor_config: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const config: any = await db.query("SELECT * FROM ai_monitor_configs WHERE guild_id = ?", [args.guildId]);
      if (!config || !config[0]) return { error: "AI monitor not configured for this guild" };
      const row = config[0];
      let channelWhitelist: string[] = [];
      let roleWhitelist: string[] = [];
      try { channelWhitelist = Array.isArray(row.channel_whitelist_ids) ? row.channel_whitelist_ids : JSON.parse(row.channel_whitelist_ids || "[]"); } catch { }
      try { roleWhitelist = Array.isArray(row.role_whitelist_ids) ? row.role_whitelist_ids : JSON.parse(row.role_whitelist_ids || "[]"); } catch { }
      return {
        config: {
          ...row,
          channel_whitelist_ids: channelWhitelist,
          role_whitelist_ids: roleWhitelist
        }
      };
    },
    list_ai_monitor_cases: async (args: { guildId: string; status?: string; userId?: string; limit?: number }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
      const params: any[] = [args.guildId];
      let sql = "SELECT case_id, event_type, user_id, channel_id, message_id, risk, recommended_action, status, created_at, summary FROM ai_monitor_cases WHERE guild_id = ?";
      if (args.status) {
        sql += " AND status = ?";
        params.push(args.status);
      }
      if (args.userId) {
        sql += " AND user_id = ?";
        params.push(args.userId);
      }
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(limit);
      const rows: any = await db.query(sql, params);
      return { cases: Array.isArray(rows) ? rows : [] };
    },
    get_ai_monitor_case: async (args: { caseId: string }): Promise<any> => {
      if (!args.caseId) return { error: "Missing caseId parameter" };
      const rows: any = await db.query("SELECT * FROM ai_monitor_cases WHERE case_id = ?", [args.caseId]);
      if (!rows || !rows[0]) return { error: "Case not found" };
      return { case: rows[0] };
    },
};

export default guildConfigFunctions;
