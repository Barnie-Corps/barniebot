import { decryptText, encryptText, parseRelatedEntities } from "../../utils";
import db from "../../mysql/database";
import NVIDIAModels from "../../NVIDIAModels";

const memoryFunctions = {
    get_current_datetime: (): string => {
      return new Date().toISOString();
    },
    create_chat_session: async (args: { userId: string; title?: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const sessionId = `chat_${args.userId}_${Date.now()}`;
      const now = Date.now();
      const title = args.title || "New Chat";
      await db.query("INSERT INTO ai_chat_sessions SET ?", [{
        session_id: sessionId,
        user_id: args.userId,
        title: title,
        created_at: now,
        updated_at: now,
        message_count: 0,
        is_active: true
      }]);
      return { sessionId, title, createdAt: now };
    },
    list_chat_sessions: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const sessions = await db.query(
        "SELECT session_id, title, created_at, updated_at, message_count, is_active FROM ai_chat_sessions WHERE user_id = ? AND is_active = TRUE ORDER BY updated_at DESC LIMIT 20",
        [args.userId]
      ) as unknown as any[];
      return { sessions };
    },
    load_chat_session: async (args: { userId: string; sessionId: string }): Promise<any> => {
      if (!args.userId || !args.sessionId) return { error: "Missing parameters" };
      const sessions = await db.query(
        "SELECT * FROM ai_chat_sessions WHERE session_id = ? AND user_id = ?",
        [args.sessionId, args.userId]
      ) as unknown as any[];
      if (!sessions[0]) return { error: "Session not found" };
      const messages = await db.query(
        "SELECT role, content, tool_calls, tool_results, created_at, compressed FROM ai_chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 200",
        [args.sessionId]
      ) as unknown as any[];
      const decryptedMessages = messages.map((msg: any) => ({
        ...msg,
        content: decryptText(msg.content),
        tool_calls: msg.tool_calls ? decryptText(msg.tool_calls) : null,
        tool_results: msg.tool_results ? decryptText(msg.tool_results) : null
      }));
      return { session: sessions[0], messages: decryptedMessages };
    },
    delete_chat_session: async (args: { userId: string; sessionId: string }): Promise<any> => {
      if (!args.userId || !args.sessionId) return { error: "Missing parameters" };
      const result: any = await db.query(
        "UPDATE ai_chat_sessions SET is_active = FALSE WHERE session_id = ? AND user_id = ?",
        [args.sessionId, args.userId]
      );
      if (result.affectedRows === 0) return { error: "Session not found" };
      return { success: true };
    },
    save_chat_message: async (args: { sessionId: string; role: string; content: string; toolCalls?: any; toolResults?: any }): Promise<any> => {
      if (!args.sessionId || !args.role || !args.content) return { error: "Missing parameters" };
      const now = Date.now();
      const encryptedContent = encryptText(args.content);
      const encryptedToolCalls = args.toolCalls ? encryptText(JSON.stringify(args.toolCalls)) : null;
      const encryptedToolResults = args.toolResults ? encryptText(JSON.stringify(args.toolResults)) : null;
      await db.query("INSERT INTO ai_chat_messages SET ?", [{
        session_id: args.sessionId,
        role: args.role,
        content: encryptedContent,
        tool_calls: encryptedToolCalls,
        tool_results: encryptedToolResults,
        created_at: now,
        compressed: false
      }]);
      await db.query(
        "UPDATE ai_chat_sessions SET message_count = message_count + 1, updated_at = ? WHERE session_id = ?",
        [now, args.sessionId]
      );
      return { success: true };
    },
    compress_chat_context: async (args: { sessionId: string }): Promise<any> => {
      if (!args.sessionId) return { error: "Missing sessionId parameter" };
      const messages = await db.query(
        "SELECT id, role, content FROM ai_chat_messages WHERE session_id = ? AND compressed = FALSE ORDER BY created_at ASC LIMIT 100",
        [args.sessionId]
      ) as unknown as any[];
      if (messages.length < 20) return { summary: "Not enough messages to compress", compressed: 0 };
      const messagesToCompress = messages.slice(0, -10);
      const conversationText = messagesToCompress.map((m: any) => `${m.role}: ${decryptText(m.content)}`).join("\n");
      const summaryPrompt = `Summarize the following conversation, preserving key information, decisions, and context:\n\n${conversationText}`;
      const summary = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: summaryPrompt }], 5000, "chat", false);
      const encryptedSummary = encryptText(summary.content);
      await db.query(
        "UPDATE ai_chat_sessions SET context_summary = ? WHERE session_id = ?",
        [encryptedSummary, args.sessionId]
      );
      const idsToCompress = messagesToCompress.map((m: any) => m.id);
      if (idsToCompress.length > 0) {
        await db.query(
          `UPDATE ai_chat_messages SET compressed = TRUE WHERE id IN (${idsToCompress.join(",")})`,
          []
        );
      }
      return { summary: summary.content, compressed: idsToCompress.length };
    },
    add_memory_to_graph: async (args: { userId: string; memoryType: string; subject: string; content: string; relatedEntities?: any[]; confidence?: number }): Promise<any> => {
      if (!args.userId || !args.memoryType || !args.subject || !args.content) return { error: "Missing parameters" };
      const now = Date.now();
      const confidence = args.confidence || 1.0;
      const encryptedContent = encryptText(args.content);
      const relatedEntities = args.relatedEntities ? JSON.stringify(args.relatedEntities) : null;
      const existing: any = await db.query(
        "SELECT id FROM ai_memory_graph WHERE user_id = ? AND memory_type = ? AND subject = ?",
        [args.userId, args.memoryType, args.subject]
      );
      if (existing && existing.length > 0) {
        await db.query(
          "UPDATE ai_memory_graph SET content = ?, related_entities = ?, confidence = ?, updated_at = ?, last_accessed = ?, access_count = access_count + 1 WHERE id = ?",
          [encryptedContent, relatedEntities, confidence, now, now, existing[0].id]
        );
        return { success: true, updated: true, id: existing[0].id };
      }
      const result: any = await db.query("INSERT INTO ai_memory_graph SET ?", [{
        user_id: args.userId,
        memory_type: args.memoryType,
        subject: args.subject,
        content: encryptedContent,
        related_entities: relatedEntities,
        confidence: confidence,
        created_at: now,
        updated_at: now,
        last_accessed: now,
        access_count: 1
      }]);
      return { success: true, updated: false, id: result.insertId };
    },
    get_memory_graph: async (args: { userId: string; memoryType?: string; subject?: string; limit?: number }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const limit = Math.min(args.limit || 50, 200);
      let query = "SELECT * FROM ai_memory_graph WHERE user_id = ?";
      const params: any[] = [args.userId];
      if (args.memoryType) {
        query += " AND memory_type = ?";
        params.push(args.memoryType);
      }
      if (args.subject) {
        query += " AND subject LIKE ?";
        params.push(`%${args.subject}%`);
      }
      query += " ORDER BY confidence DESC, access_count DESC, updated_at DESC LIMIT ?";
      params.push(limit);
      const memories = await db.query(query, params) as unknown as any[];
      const now = Date.now();
      if (memories.length > 0) {
        const ids = memories.map((m: any) => m.id);
        await db.query(
          `UPDATE ai_memory_graph SET last_accessed = ?, access_count = access_count + 1 WHERE id IN (${ids.join(",")})`,
          [now]
        );
      }
      const decryptedMemories = memories.map((mem: any) => ({
        ...mem,
        content: decryptText(mem.content),
        related_entities: parseRelatedEntities(mem.related_entities)
      }));
      return { memories: decryptedMemories };
    },
    search_memory_graph: async (args: { userId: string; query: string; limit?: number }): Promise<any> => {
      if (!args.userId || !args.query) return { error: "Missing parameters" };
      const limit = Math.min(args.limit || 20, 100);
      const searchTerm = `%${args.query}%`;
      const memories = await db.query(
        "SELECT * FROM ai_memory_graph WHERE user_id = ? AND (subject LIKE ? OR content LIKE ?) ORDER BY confidence DESC, access_count DESC LIMIT ?",
        [args.userId, searchTerm, searchTerm, limit]
      ) as unknown as any[];
      const decryptedMemories = memories.map((mem: any) => ({
        ...mem,
        content: decryptText(mem.content),
        related_entities: parseRelatedEntities(mem.related_entities)
      }));
      return { memories: decryptedMemories };
    },
};

export default memoryFunctions;
