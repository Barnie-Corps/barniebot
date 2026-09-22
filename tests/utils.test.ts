declare var jest: any;
declare var describe: any;
declare var test: any;
declare var it: any;
declare var expect: any;

jest.mock("../Workers", () => ({
  __esModule: true,
  default: {
    bulkCreateWorkers: jest.fn(),
    prewarmType: jest.fn().mockResolvedValue(undefined),
    getAvailableWorker: jest.fn(),
    createWorker: jest.fn(),
    AwaitAvailableWorker: jest.fn(),
    sendMessage: jest.fn(),
    postMessage: jest.fn(),
    awaitResponse: jest.fn()
  }
}));

jest.mock("../managers/StaffRanksManager", () => ({
  __esModule: true,
  default: {
    hasMinimumRank: jest.fn(),
    getRankHierarchyByName: jest.fn(),
    getRankByHierarchy: jest.fn(),
    getRankByName: jest.fn(),
    hasPermission: jest.fn()
  }
}));

jest.mock("../mysql/database", () => ({
  __esModule: true,
  default: {
    query: jest.fn()
  }
}));

jest.mock("../NVIDIAModels", () => ({
  __esModule: true,
  default: {}
}));

jest.mock("../Log", () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn()
  }
}));

jest.mock("../data", () => ({
  __esModule: true,
  default: {
    bot: {
      owners: [],
      staff_ranks: []
    }
  }
}));

jest.mock("../index", () => ({
  __esModule: true,
  default: {
    guilds: {
      fetch: jest.fn()
    }
  }
}));

jest.mock("../managers/CacheManager", () => ({
  __esModule: true,
  default: {
    getLocal: jest.fn(),
    setLocal: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    initialize: jest.fn(),
    isRedisAvailable: jest.fn()
  }
}));

import { createCipheriv, randomBytes } from "crypto";
import utils from "../utils";

describe("utils.createCensored", () => {
  test("returns asterisks matching the requested length", () => {
    expect(utils.createCensored(5)).toBe("*****");
  });

  test("returns an empty string for zero length", () => {
    expect(utils.createCensored(0)).toBe("");
  });
});

describe("utils.encryptWithAES and utils.decryptWithAES", () => {
  const key = randomBytes(32).toString("base64");

  test("encrypts and decrypts data successfully", () => {
    const plaintext = "sensitive payload";
    const encrypted = utils.encryptWithAES(key, plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(utils.decryptWithAES(key, encrypted)).toBe(plaintext);
  });

  test("produces different ciphertext for the same plaintext", () => {
    const plaintext = "repeatable secret";
    const encryptedA = utils.encryptWithAES(key, plaintext);
    const encryptedB = utils.encryptWithAES(key, plaintext);

    expect(encryptedA).not.toBe(encryptedB);
    expect(utils.decryptWithAES(key, encryptedA)).toBe(plaintext);
    expect(utils.decryptWithAES(key, encryptedB)).toBe(plaintext);
  });

  test("returns null for malformed encrypted payloads", () => {
    expect(utils.decryptWithAES(key, "")).toBeNull();
    expect(utils.decryptWithAES(key, "deadbeef")).toBeNull();
  });

  test("decrypts legacy CBC payloads", () => {
    const plaintext = "legacy secret";
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", Buffer.from(key, "base64"), iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const legacyPayload = `${iv.toString("hex")}:${encrypted}`;

    expect(utils.decryptWithAES(key, legacyPayload)).toBe(plaintext);
  });
});

describe("utils.password helpers", () => {
  test("hashes and verifies passwords with bcrypt", async () => {
    const hashed = await utils.hashPassword("correct horse battery staple");

    expect(utils.isBcryptPasswordHash(hashed)).toBe(true);
    expect((await utils.verifyPassword(hashed, "correct horse battery staple")).valid).toBe(true);
    expect((await utils.verifyPassword(hashed, "nope")).valid).toBe(false);
  });
});

describe("utils.parseToolCalls", () => {
  test("extracts tool calls and removes wrapper tokens from the cleaned text", () => {
    const content = [
      "Before",
      "<|tool_calls_begin|>",
      '<|tool_call_begin|>lookup<|tool_sep|>{"id":42}<|tool_call_end|>',
      "</tool_calls>",
      "After"
    ].join(" ");

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "Before    After",
      toolCalls: [
        {
          name: "lookup",
          args: { id: 42 }
        }
      ]
    });
  });

  test("repairs truncated json arguments when possible", () => {
    const content = '<tool_call>search<tool_sep>{"query":"barnie"</tool_call>';

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "",
      toolCalls: [
        {
          name: "search",
          args: { query: "barnie" }
        }
      ]
    });
  });

  test("handles multiple tool calls and preserves surrounding text", () => {
    const content = [
      "Start",
      '<tool_call>first<tool_sep>{"step":1}</tool_call>',
      "middle",
      '<|tool_call_begin|>second<|tool_sep|>{"step":2}<|tool_call_end|>',
      "End"
    ].join(" ");

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "Start  middle  End",
      toolCalls: [
        {
          name: "first",
          args: { step: 1 }
        },
        {
          name: "second",
          args: { step: 2 }
        }
      ]
    });
  });
});

describe("utils.AIFunctions", () => {
  const expectedKeys = [
    "list_knowledge_sources",
    "search_knowledge",
    "get_knowledge_source",
    "get_user_data",
    "set_user_language",
    "fetch_url",
    "fetch_url_safe",
    "api_request",
    "generate_code",
    "retrieve_owners",
    "isOwner",
    "fetch_user",
    "fetch_discord_user",
    "get_memories",
    "insert_memory",
    "remove_memory",
    "remove_memories",
    "fetch_ai_rules",
    "search_user_by_username",
    "search_user_by_username_discord",
    "update_user_data",
    "execute_query",
    "on_guild",
    "current_guild_info",
    "guild_info",
    "get_member_permissions",
    "get_member_roles",
    "get_message_context",
    "get_user_context",
    "get_guild_context",
    "get_user_case_history",
    "get_channel_case_history",
    "get_guild_audit_events",
    "get_member_safety_profile",
    "get_monitor_entity_profile",
    "list_guild_channels",
    "search_guild_channels",
    "get_channel_info",
    "create_guild_channel",
    "edit_guild_channel",
    "delete_guild_channel",
    "create_thread",
    "send_email",
    "get_current_channel_info",
    "send_channel_message",
    "send_channel_embed",
    "set_channel_permissions",
    "send_dm",
    "kick_member",
    "check_vip_status",
    "list_guild_roles",
    "get_role_info",
    "create_role",
    "edit_role",
    "delete_role",
    "add_role_to_member",
    "remove_role_from_member",
    "get_role_members",
    "list_guild_members",
    "search_guild_members",
    "get_member_info",
    "ban_member",
    "unban_member",
    "timeout_member",
    "remove_timeout_member",
    "set_member_nickname",
    "move_member_voice",
    "list_workspace_files",
    "read_workspace_file",
    "write_workspace_file",
    "append_workspace_file",
    "delete_workspace_entry",
    "move_workspace_entry",
    "create_workspace_directory",
    "download_to_workspace",
    "search_workspace_text",
    "workspace_file_info",
    "search_web",
    "attach_workspace_file",
    "execute_js_code",
    "execute_command",
    "get_bot_statistics",
    "check_database_health",
    "get_worker_pool_status",
    "clear_translation_cache",
    "get_user_warnings",
    "get_warning_details",
    "appeal_warning",
    "get_pending_appeals",
    "review_appeal",
    "global_ban_user",
    "global_unban_user",
    "global_mute_user",
    "global_unmute_user",
    "get_global_ban_status",
    "get_global_mute_status",
    "create_support_ticket",
    "create_bug_report",
    "get_ticket_details",
    "get_user_tickets",
    "assign_ticket",
    "close_ticket",
    "add_ticket_message",
    "get_ticket_messages",
    "add_staff_note",
    "get_staff_notes",
    "update_staff_status",
    "get_staff_audit_log",
    "get_rpg_character",
    "get_rpg_inventory",
    "get_rpg_equipment",
    "get_rpg_session",
    "get_rpg_account_status",
    "get_filter_config",
    "get_filter_words",
    "get_filter_webhooks",
    "get_custom_responses",
    "get_custom_response",
    "search_custom_responses",
    "get_globalchat_config",
    "get_ai_monitor_config",
    "list_ai_monitor_cases",
    "get_ai_monitor_case",
    "get_command_list",
    "get_command_info",
    "search_commands",
    "get_bot_features",
    "get_staff_permissions",
    "is_staff",
    "get_user_staff_rank",
    "check_vip_expiration",
    "get_system_info",
    "list_project_files",
    "read_project_file_lines",
    "search_project_text",
    "project_file_info",
    "list_log_files",
    "read_log_file_lines",
    "tail_log_file",
    "search_logs",
    "github_list_repo_dir",
    "github_fetch_repo_file",
    "github_search_repo",
    "get_current_datetime",
    "create_chat_session",
    "list_chat_sessions",
    "load_chat_session",
    "delete_chat_session",
    "save_chat_message",
    "compress_chat_context",
    "add_memory_to_graph",
    "get_memory_graph",
    "search_memory_graph",
    "set_slowmode",
    "search_messages",
    "list_invites",
    "create_invite",
    "list_webhooks",
    "create_webhook",
    "manage_thread",
    "manage_scheduled_event",
    "list_emojis",
    "list_stickers",
    "manage_pin",
    "manage_giveaway",
    "create_reminder",
    "check_local_model",
    "list_local_models",
  ];

  test("exposes every AI-callable function across the split domain modules", () => {
    expect(Object.keys(utils.AIFunctions).sort()).toEqual([...expectedKeys].sort());
  });

  test("every entry is a callable function", () => {
    for (const key of expectedKeys) {
      expect(typeof utils.AIFunctions[key]).toBe("function");
    }
  });
});
