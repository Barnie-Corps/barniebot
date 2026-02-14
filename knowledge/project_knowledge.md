# BarnieBot Project Knowledge (Extended)

Last Updated: 2026-02-14

This document is a comprehensive, source-based inventory of the BarnieBot repository. It consolidates behavior, data models, and command surfaces directly from the code and documentation in this workspace. No external or speculative details are included.

Sources used:
- README.md
- usage_policy.md
- privacy.md
- SECURITY.md
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- SPECIAL_CONTRIBUTORS.md
- package.json
- tsconfig.json
- ai_rules.json
- based.txt
- transcript_placeholder.html
- verification_placeholder.html
- index.ts
- ai.ts
- AIFunctions.ts
- AIMonitorFunctions.ts
- utils.ts
- rpg_init.ts
- NVIDIAModels.ts
- managers/*
- commands/*
- mysql/database.ts
- mysql/queries.ts
- workers/translate.js
- workers/ratelimit.js
- types/interfaces.ts
- utils/audioUtils.ts

----------------------------------------------------------------
SECTION 1 - PROJECT OVERVIEW
----------------------------------------------------------------

Project name:
- BarnieBot

High-level purpose:
- Multi-system Discord bot with:
	- Global chat networking and translation.
	- AI chat, voice, and vision features.
	- RPG accounts, gameplay, and economy.
	- Moderation and staff tooling with audit trails.
	- Support ticket system with transcript export.

Tech stack (from README.md and package.json):
- Runtime: Node.js 18+.
- Language: TypeScript 5.x.
- Discord library: discord.js v14.
- Database: MySQL 5.7+ (pool via mysql).
- AI: NVIDIA NIM via OpenAI-compatible client.
- Voice: NVIDIA Riva (ASR/TTS) via gRPC.
- Workers: Node worker_threads for translation and ratelimit scheduling.
- Email: nodemailer (Gmail SMTP) for RPG verification.

Repository ownership and licensing:
- MIT license (see header in index.ts and LICENSE file).
- Attribution guidance in based.txt.

Key features (README.md summary):
- Global chat with encryption and translation.
- AI chat, ask, voice, and monitor.
- RPG system with multiple classes, inventory, trading, and combat.
- Staff hierarchy and moderation tools.
- Support tickets with transcripts.

----------------------------------------------------------------
SECTION 2 - RUNTIME AND BOOT SEQUENCE
----------------------------------------------------------------

Entry points:
- index.ts: main bot bootstrap and runtime.
- ProcessManager.ts: optional external runner for auto-restart.

Environment variables (README.md + code):
- Required:
	- TOKEN
	- DISCORD_BOT_ID
	- OWNERS
	- DB_HOST
	- DB_USER
	- DB_PASSWORD
	- DB_NAME
	- ENCRYPTION_KEY
	- NVIDIA_API_KEY
	- EMAIL_PASSWORD
- Optional:
	- TRANSLATE_WORKERS
	- NOTIFY_STARTUP
	- SAFELY_SHUTTED_DOWN
	- REBOOTING
	- TEST
	- IGNORE_GLOBAL_CHAT
	- SEARCH_ENGINE_API_KEY
	- SEARCH_ENGINE_CX
	- NVIDIA_STT_FUNCTION_ID
	- NVIDIA_TTS_FUNCTION_ID
	- FETCH_MEMBERS_ON_STARTUP

Startup flow (index.ts):
- Loads .env via dotenv and sets REBOOTING default to 0 if missing.
- Creates Discord client with intents and partials.
- Loads command modules from commands/ and registers into data.bot.commands.
- On clientReady:
	- Ensures DB tables via mysql/queries.ts.
	- Initializes staff ranks (StaffRanksManager.initialize).
	- Seeds RPG shop items and RPG base data (rpg_init.ts).
	- Pre-fetches staff users for cache stability.
	- Optionally fetches guild members if FETCH_MEMBERS_ON_STARTUP=1.
	- Registers slash commands via load_slash.ts.
	- Loads owners from OWNERS into staff table.
	- Broadcasts startup announcements if NOTIFY_STARTUP is enabled.
	- Handles REBOOTING flag and updates .env.
	- Spawns translation workers and ratelimit worker.
	- Starts warning cleanup scheduler.

Process manager (ProcessManager.ts):
- Detects runner: ts-node, tsx, or node JS fallback.
- Auto-restart with crash detection patterns.
- Logs to logs/process-manager.log.
- Writes CRITICAL_FAILURE.txt after max restarts.

Shutdown handling (index.ts):
- Owner prefix command b.shutdown:
	- Broadcasts global announcement.
	- Sets SAFELY_SHUTTED_DOWN=1.
	- Exits after delay.
- Owner prefix command b.reboot:
	- Broadcasts announcement.
	- Sets REBOOTING=1, SAFELY_SHUTTED_DOWN=1.
	- Exits with code 1 for ProcessManager auto-restart.

----------------------------------------------------------------
SECTION 3 - CONFIGURATION AND SHARED DATA
----------------------------------------------------------------

Shared data (data.ts):
- data.database: host, user, password, database, charset.
- data.bot:
	- owners list
	- emojis and loadingEmoji
	- token
	- commands: Collection
	- encryption_key
	- log_channel
	- home_guild
	- support_category
	- transcripts_channel
	- bug_reports_channel
	- staff_ranks (loaded by StaffRanksManager)
	- default_staff_ranks

Type definitions (types/interfaces.ts):
- DataType, BotEmoji
- ChatManagerOptions, Ratelimit
- DiscordUser, UserLanguage
- RPGSession, RPGCharacter, RPGItem, RPGInventoryItem, RPGEquippedItem, RPGEquipment
- RPGDungeon, RPGDungeonRun
- RPGCraftingMaterial, RPGCraftingRecipe
- RPGAchievement, RPGPet
- RPGGuild, RPGGuildMember
- GlobalChat, CustomResponse, FilterConfig, FilterWord
- GlobalWarning, GlobalBan
- SupportTicket, SupportMessage
- StaffNote, StaffMember, StaffRank
- AIMemory, MessageCount
- CountResult, LastInsertIdResult, ExecutedCommand

Collection class (classes/Collection.ts):
- Local copy of Discord.js Collection with extensive Map utilities.

----------------------------------------------------------------
SECTION 4 - DATABASE SCHEMA (mysql/queries.ts)
----------------------------------------------------------------

All tables are created on startup. Columns are shown as defined in queries.ts.

Moderation and staff tables:
- global_warnings:
	- id INT PK
	- userid VARCHAR(255)
	- reason TEXT
	- authorid VARCHAR(255)
	- createdAt BIGINT
	- points INT
	- category VARCHAR(50)
	- expires_at BIGINT
	- active BOOLEAN
	- appealed BOOLEAN
	- appeal_status VARCHAR(20)
	- appeal_reason TEXT
	- appeal_reviewed_by VARCHAR(255)
	- appeal_reviewed_at BIGINT
- staff_ranks:
	- id INT PK
	- name VARCHAR(100) UNIQUE
	- hierarchy_position INT UNIQUE
	- permissions JSON
	- created_at BIGINT
- staff:
	- uid VARCHAR(255) PK
	- rank VARCHAR(64)
	- hierarchy_position INT
- global_mutes:
	- id VARCHAR(255) PK
	- reason VARCHAR(255)
	- authorid VARCHAR(255)
	- createdAt BIGINT
	- until BIGINT
- staff_status:
	- user_id VARCHAR(255) PK
	- status VARCHAR(20)
	- status_message VARCHAR(255)
	- updated_at BIGINT
- staff_notes:
	- id INT PK
	- user_id VARCHAR(255)
	- staff_id VARCHAR(255)
	- note TEXT
	- created_at BIGINT
- staff_audit_log:
	- id INT PK
	- staff_id VARCHAR(255)
	- action_type VARCHAR(50)
	- target_id VARCHAR(255)
	- details TEXT
	- metadata JSON
	- created_at BIGINT

Global chat tables:
- globalchats:
	- guild VARCHAR(255)
	- channel VARCHAR(255)
	- enabled BOOLEAN
	- banned BOOLEAN
	- autotranslate BOOLEAN
	- language VARCHAR(2)
	- webhook_token VARCHAR(255)
	- webhook_id VARCHAR(255)
- global_messages:
	- id INT PK
	- uid VARCHAR(255)
	- content TEXT
	- language VARCHAR(2)
- global_bans:
	- id VARCHAR(255)
	- active BOOLEAN
	- times INT

User profile and command tracking tables:
- languages:
	- userid VARCHAR(255)
	- lang VARCHAR(5)
- discord_users:
	- id VARCHAR(255)
	- pfp VARCHAR(255)
	- username VARCHAR(255)
	- command_executions INT
- executed_commands:
	- command VARCHAR(255)
	- uid VARCHAR(255)
	- at INT
	- is_last BOOLEAN
- message_count:
	- uid VARCHAR(255)
	- count INT

Filter and custom responses tables:
- filter_configs:
	- guild VARCHAR(255)
	- enabled BOOLEAN
	- log_channel VARCHAR(255)
	- enabled_logs BOOLEAN
	- lang VARCHAR(2)
- filter_words:
	- id INT PK
	- guild VARCHAR(255)
	- content VARCHAR(255)
	- protected BOOLEAN
	- single BOOLEAN
- filter_webhooks:
	- id VARCHAR(255)
	- token VARCHAR(255)
	- channel VARCHAR(255)
- custom_responses:
	- id INT PK
	- guild VARCHAR(255)
	- command VARCHAR(255)
	- response TEXT
	- is_regex BOOLEAN

VIP tables:
- vip_users:
	- id VARCHAR(255)
	- start_date BIGINT
	- end_date BIGINT

Support ticket tables:
- support_tickets:
	- id INT PK
	- user_id VARCHAR(255)
	- channel_id VARCHAR(255)
	- message_id VARCHAR(255)
	- status VARCHAR(50)
	- priority VARCHAR(20)
	- category VARCHAR(50)
	- assigned_to VARCHAR(255)
	- created_at BIGINT
	- closed_at BIGINT
	- closed_by VARCHAR(255)
	- first_response_at BIGINT
	- first_response_by VARCHAR(255)
	- initial_message TEXT
	- guild_id VARCHAR(255)
	- guild_name VARCHAR(255)
- support_messages:
	- id INT PK
	- ticket_id INT
	- user_id VARCHAR(255)
	- username VARCHAR(255)
	- content TEXT
	- timestamp BIGINT
	- is_staff BOOLEAN
	- staff_rank VARCHAR(64)

AI memory and AI monitor tables:
- ai_memories:
	- id INT PK
	- uid VARCHAR(255)
	- memory TEXT
- ai_monitor_configs:
	- guild_id VARCHAR(255) PK
	- enabled BOOLEAN
	- logs_channel VARCHAR(255)
	- allow_actions BOOLEAN
	- analyze_potentially BOOLEAN
	- allow_investigation_tools BOOLEAN
	- monitor_language VARCHAR(5)
	- created_at BIGINT
	- updated_at BIGINT
- ai_monitor_cases:
	- case_id VARCHAR(64) PK
	- guild_id VARCHAR(255)
	- event_type VARCHAR(50)
	- user_id VARCHAR(255)
	- channel_id VARCHAR(255)
	- message_id VARCHAR(255)
	- summary TEXT
	- risk VARCHAR(20)
	- recommended_action VARCHAR(32)
	- recommended_actions JSON
	- action_payload JSON
	- status VARCHAR(20)
	- created_at BIGINT
	- updated_at BIGINT
	- log_channel_id VARCHAR(255)
	- log_message_id VARCHAR(255)
	- allow_actions BOOLEAN
	- auto_action_taken BOOLEAN
	- reason TEXT
	- confidence DECIMAL(4,3)

Notification tables:
- global_notifications:
	- id INT PK
	- content TEXT (utf8mb4)
	- language VARCHAR(5)
	- created_by VARCHAR(255)
	- created_at BIGINT
- user_notification_reads:
	- user_id VARCHAR(255)
	- notification_id INT
	- read_at BIGINT
	- PRIMARY KEY (user_id, notification_id)

RPG account and session tables:
- registered_accounts:
	- id INT PK
	- uid VARCHAR(255)
	- username VARCHAR(255)
	- email VARCHAR(255)
	- password TEXT (AES-256-CBC encrypted)
	- verified BOOLEAN
	- verification_code VARCHAR(255)
	- verified_at BIGINT
	- created_at BIGINT
	- last_login BIGINT
	- last_user_logged VARCHAR(255)
	- token VARCHAR(255)
- logins:
	- id INT PK
	- uid VARCHAR(255)
	- at BIGINT
	- status BOOLEAN
- rpg_sessions:
	- id INT PK
	- account_id INT UNIQUE
	- uid VARCHAR(255)
	- logged_in_at BIGINT
	- last_activity BIGINT
	- active BOOLEAN
- rpg_account_status:
	- account_id INT PK
	- frozen BOOLEAN
	- frozen_reason TEXT
	- frozen_by VARCHAR(255)
	- frozen_at BIGINT
	- banned BOOLEAN
	- banned_reason TEXT
	- banned_by VARCHAR(255)
	- banned_at BIGINT

RPG character and combat tables:
- rpg_characters:
	- id INT PK
	- account_id INT
	- uid VARCHAR(255)
	- name VARCHAR(50)
	- class VARCHAR(30)
	- level INT
	- experience BIGINT
	- hp INT
	- max_hp INT
	- mp INT
	- max_mp INT
	- strength INT
	- defense INT
	- agility INT
	- intelligence INT
	- luck INT
	- stat_points INT
	- gold BIGINT
	- created_at BIGINT
	- last_action BIGINT
- rpg_combat_logs:
	- id INT PK
	- attacker_id INT
	- defender_id INT
	- action_type VARCHAR(30)
	- damage_dealt INT
	- hp_remaining INT
	- result VARCHAR(20)
	- occurred_at BIGINT

RPG item and equipment tables:
- rpg_items:
	- id INT PK
	- name VARCHAR(100)
	- description TEXT
	- type VARCHAR(30)
	- rarity VARCHAR(20)
	- base_value INT
	- tradeable BOOLEAN
	- stackable BOOLEAN
	- max_stack INT
- rpg_equipment:
	- id INT PK
	- item_id INT
	- slot VARCHAR(30)
	- required_level INT
	- required_class VARCHAR(30)
	- strength_bonus INT
	- defense_bonus INT
	- agility_bonus INT
	- intelligence_bonus INT
	- luck_bonus INT
	- hp_bonus INT
	- mp_bonus INT
	- special_effect VARCHAR(100)
- rpg_weapons:
	- id INT PK
	- item_id INT
	- weapon_type VARCHAR(30)
	- min_damage INT
	- max_damage INT
	- attack_speed DECIMAL(3,2)
	- critical_chance DECIMAL(5,2)
	- required_level INT
	- required_class VARCHAR(30)
- rpg_consumables:
	- id INT PK
	- item_id INT
	- effect_type VARCHAR(30)
	- effect_value INT
	- duration INT
	- cooldown INT
- rpg_inventory:
	- id INT PK
	- character_id INT
	- item_id INT
	- quantity INT
	- acquired_at BIGINT
	- bound BOOLEAN
- rpg_equipped_items:
	- character_id INT
	- slot VARCHAR(30)
	- item_id INT
	- inventory_id INT
	- equipped_at BIGINT
	- PRIMARY KEY (character_id, slot)

RPG quests and skills tables:
- rpg_quests:
	- id INT PK
	- name VARCHAR(100)
	- description TEXT
	- required_level INT
	- reward_gold INT
	- reward_experience INT
	- reward_item_id INT
	- repeatable BOOLEAN
	- cooldown INT
- rpg_character_quests:
	- id INT PK
	- character_id INT
	- quest_id INT
	- status VARCHAR(20)
	- progress INT
	- accepted_at BIGINT
	- completed_at BIGINT
	- last_completion BIGINT
- rpg_skills:
	- id INT PK
	- name VARCHAR(50)
	- class VARCHAR(30)
	- description TEXT
	- required_level INT
	- mp_cost INT
	- cooldown INT
	- damage_multiplier DECIMAL(4,2)
	- effect_type VARCHAR(30)
	- effect_value INT
- rpg_character_skills:
	- character_id INT
	- skill_id INT
	- level INT
	- last_used BIGINT
	- PRIMARY KEY (character_id, skill_id)

RPG trades and market tables:
- rpg_trades:
	- id INT PK
	- initiator_id INT
	- receiver_id INT
	- initiator_gold BIGINT
	- initiator_items TEXT
	- receiver_gold BIGINT
	- receiver_items TEXT
	- status VARCHAR(20)
	- created_at BIGINT
	- completed_at BIGINT
- rpg_market_listings:
	- id INT PK
	- seller_id INT
	- item_id INT
	- quantity INT
	- price_per_unit INT
	- listed_at BIGINT
	- expires_at BIGINT
	- sold BOOLEAN

RPG guild tables:
- rpg_guilds:
	- id INT PK
	- name VARCHAR(50) UNIQUE
	- description TEXT
	- founder_id INT
	- level INT
	- experience BIGINT
	- gold BIGINT
	- member_capacity INT
	- created_at BIGINT
	- emblem_icon VARCHAR(50)
- rpg_guild_members:
	- character_id INT
	- guild_id INT
	- role VARCHAR(30)
	- joined_at BIGINT
	- contribution_points INT
	- PRIMARY KEY (character_id, guild_id)
- rpg_guild_upgrades:
	- id INT PK
	- guild_id INT
	- upgrade_type VARCHAR(50)
	- level INT
	- bonus_value INT
	- purchased_at BIGINT

RPG achievements and daily rewards:
- rpg_achievements:
	- id INT PK
	- name VARCHAR(100)
	- description TEXT
	- category VARCHAR(30)
	- requirement_type VARCHAR(50)
	- requirement_value INT
	- reward_gold INT
	- reward_experience INT
	- reward_item_id INT
	- icon VARCHAR(20)
	- hidden BOOLEAN
- rpg_character_achievements:
	- character_id INT
	- achievement_id INT
	- progress INT
	- unlocked BOOLEAN
	- unlocked_at BIGINT
	- PRIMARY KEY (character_id, achievement_id)
- rpg_daily_rewards:
	- character_id INT PK
	- last_claim BIGINT
	- streak INT
	- total_claims INT

RPG dungeons and pets:
- rpg_dungeons:
	- id INT PK
	- name VARCHAR(100)
	- description TEXT
	- required_level INT
	- difficulty VARCHAR(20)
	- stages INT
	- boss_name VARCHAR(50)
	- reward_gold_min INT
	- reward_gold_max INT
	- reward_exp_min INT
	- reward_exp_max INT
	- cooldown INT
- rpg_dungeon_runs:
	- id INT PK
	- character_id INT
	- dungeon_id INT
	- stage INT
	- status VARCHAR(20)
	- started_at BIGINT
	- completed_at BIGINT
	- rewards_claimed BOOLEAN
- rpg_pets:
	- id INT PK
	- name VARCHAR(50)
	- description TEXT
	- rarity VARCHAR(20)
	- base_price INT
	- strength_bonus INT
	- defense_bonus INT
	- agility_bonus INT
	- intelligence_bonus INT
	- luck_bonus INT
	- special_ability VARCHAR(100)
	- emoji VARCHAR(20)
- rpg_character_pets:
	- id INT PK
	- character_id INT
	- pet_id INT
	- name VARCHAR(50)
	- level INT
	- experience INT
	- happiness INT
	- is_active BOOLEAN
	- acquired_at BIGINT
	- last_fed BIGINT

RPG crafting tables:
- rpg_crafting_materials:
	- id INT PK
	- name VARCHAR(50)
	- description TEXT
	- rarity VARCHAR(20)
	- stack_size INT
	- drop_rate DECIMAL(5,2)
	- emoji VARCHAR(20)
- rpg_crafting_recipes:
	- id INT PK
	- name VARCHAR(100)
	- result_item_id INT
	- required_level INT
	- material_1_id INT
	- material_1_qty INT
	- material_2_id INT
	- material_2_qty INT
	- material_3_id INT
	- material_3_qty INT
	- gold_cost INT
	- success_rate DECIMAL(5,2)
- rpg_character_materials:
	- character_id INT
	- material_id INT
	- quantity INT
	- PRIMARY KEY (character_id, material_id)

Other:
- guilds:
	- id VARCHAR(255)
	- name VARCHAR(255)
	- member_count INT
	- is_in BOOLEAN

----------------------------------------------------------------
SECTION 5 - LOGGING AND DIAGNOSTICS
----------------------------------------------------------------

LogManager (managers/LogManager.ts):
- Winston logger with daily rotate files.
- Console log with colored output and metadata tables.
- application-%DATE%.log and error-%DATE%.log.

Log helper (Log.ts):
- Singleton wrapper for LogManager.

Error handling (index.ts):
- Global process uncaughtException and unhandledRejection handlers.
- Slash command execution errors write a detailed log file under logs/.

----------------------------------------------------------------
SECTION 6 - AI SYSTEMS
----------------------------------------------------------------

AI manager (managers/AiManager.ts):
- Maintains per-user chat sessions and voice sessions.
- Ratelimits AI calls via in-memory counters.
- Supports local function handlers for chat (add/remove user).
- Ensures initial tool bootstrap (get_user_data, get_memories, fetch_ai_rules).
- Parses tool call markup and executes declared tools in utils.AIFunctions.
- Handles oversized responses by writing to temporary file.

AI model integration (managers/NVIDIAModelsManager.ts):
- OpenAI-compatible client pointing at NVIDIA NIM base URL.
- Model routing by task:
	- chat: deepseek-ai/deepseek-v3.1-terminus
	- reasoning: deepseek-ai/deepseek-v3.2
	- math: qwen/qwq-32b
	- programming: minimaxai/minimax-m2.1
	- monitor_small: meta/llama-3.1-8b-instruct
	- monitor_large: deepseek-ai/deepseek-v3.1-terminus
- Safety model: nvidia/llama-3.1-nemoguard-8b-content-safety
- Chat sessions support tool calls and strip think tags.
- Riva ASR/TTS via gRPC.

AI rules (ai_rules.json):
- Defines behavior constraints for AI use in the bot context.
- Includes safety, moderation, and tool usage restrictions.

AI tool declarations (AIFunctions.ts):
- Tool declaration list used for AI function calling.
- The declared tools include:
	- User data: get_user_data, update_user_data, retrieve_owners, isOwner
	- Memory: get_memories, insert_memory, remove_memory, remove_memories
	- AI rules: fetch_ai_rules
	- Knowledge tools: list_knowledge_sources, search_knowledge, get_knowledge_source
	- Discord info: fetch_user, fetch_discord_user, search_user_by_username, search_user_by_username_discord
	- Guild context: on_guild, guild_info, current_guild_info
	- Permissions: get_member_permissions, get_member_roles
	- Channel operations: list_guild_channels, search_guild_channels, get_channel_info
	- Channel management: create_guild_channel, edit_guild_channel, delete_guild_channel, create_thread
	- Messaging: send_channel_message, send_channel_embed, send_dm, edit_msg
	- Moderation: kick_member
	- VIP: check_vip_status, check_vip_expiration
	- Workspace (ai_workspace): list_workspace_files, read_workspace_file, write_workspace_file, append_workspace_file, delete_workspace_entry, move_workspace_entry, create_workspace_directory, download_to_workspace, search_workspace_text, workspace_file_info, attach_workspace_file
	- Project files: list_project_files, read_project_file_lines, search_project_text, project_file_info
	- Logs: list_log_files, read_log_file_lines, tail_log_file, search_logs
	- Web: fetch_url, search_web
	- Execution: execute_js_code, execute_command
	- Email: send_email
	- System: get_bot_statistics, check_database_health, get_worker_pool_status, clear_translation_cache, get_system_info, get_current_datetime
	- Moderation data: get_user_warnings, get_warning_details, appeal_warning, get_pending_appeals, review_appeal
	- Global moderation: global_ban_user, global_unban_user, global_mute_user, global_unmute_user, get_global_ban_status, get_global_mute_status
	- Support: create_support_ticket, create_bug_report, get_ticket_details, get_user_tickets, assign_ticket, close_ticket, add_ticket_message, get_ticket_messages
	- Staff: add_staff_note, get_staff_notes, update_staff_status, get_staff_audit_log, get_staff_permissions
	- RPG: get_rpg_character, get_rpg_inventory, get_rpg_equipment, get_rpg_session, get_rpg_account_status
	- Filter and custom responses: get_filter_config, get_filter_words, get_filter_webhooks, get_custom_responses, get_custom_response, search_custom_responses
	- Global chat and AI monitor: get_globalchat_config, get_ai_monitor_config, list_ai_monitor_cases, get_ai_monitor_case
	- Command metadata: get_command_list, get_command_info, search_commands, get_bot_features
	- Conversation control: end_conversation, add_user_to_convo, remove_user_from_convo
	- Code generation: generate_code

AI monitor tool declarations (AIMonitorFunctions.ts):
- Tools for investigation:
	- fetch_url_safe
	- fetch_discord_user
	- search_user_by_username_discord
	- get_user_warnings
	- get_warning_details
	- get_message_context
	- get_user_context
	- get_guild_context

AI monitor manager (managers/AiMonitorManager.ts):
- Observes message, member, role, channel, invite, webhook, and ban events.
- Builds signals for scam patterns, suspicious keywords, attachment types, obfuscated links.
- Maintains per-guild rate limits for analysis to avoid overload.
- Optional use of investigation tools based on config.
- Generates alerts and stores AI monitor cases in ai_monitor_cases.
- Supports auto-actions: delete, warn, timeout, kick, ban (conditional on config).

----------------------------------------------------------------
SECTION 7 - GLOBAL CHAT SYSTEM
----------------------------------------------------------------

Chat manager (managers/ChatManager.ts):
- Maintains active guild list and caches.
- Enforces global chat rate limits per user.
- Sanitizes links in relayed content.
- Uses webhooks to relay messages to other guilds.
- Tracks per-guild language and autotranslate settings.
- Stores global messages in global_messages (encrypted content in code path).
- Uses translation workers and cache with circuit breaker.
- Provides broadcast announce for global announcements.

Global commands manager (managers/GlobalCommandsManager.ts):
- Prefix commands b.rules and b.help.
- Supports per-language translation for rules.
- Sends announcements through ChatManager after relaying command.

Global chat configuration commands (commands/globalchats.ts):
- /globalchat set: configure channel, create webhook.
- /globalchat toggle: enable or disable relay.
- /globalchat autotranslate: toggle translation for guild.
- /globalchat language: set guild language.

Global moderation (commands/globalmod.ts):
- /globalmod blacklist, unblacklist
- /globalmod warn with categories, points, and expiry
- /globalmod mute and unmute
- /globalmod status
- /globalmod closeticket
- /globalmod search_user
- Auto-escalation thresholds:
	- 3 points: auto-mute 24h
	- 5 points: auto-ban

----------------------------------------------------------------
SECTION 8 - SUPPORT TICKETS
----------------------------------------------------------------

Support command (commands/support.ts):
- /support message
- Creates support ticket channel in home guild and logs initial message.
- Assigns staff based on availability and workload.
- Provides close button to user and to staff.

Ticket management (commands/stafftools.ts):
- /stafftools tickets, assign, priority, category, status
- /stafftools note, notes
- /stafftools search
- /stafftools auditlog
- /stafftools reviewappeals
- /stafftools notify
- /stafftools rpg_* admin operations

Ticket closure flow (index.ts and globalmod.ts):
- Generates TXT and HTML transcripts using transcript_placeholder.html.
- Sends transcripts to transcripts_channel.
- Updates ticket status and logs in staff_audit_log.
- Optionally deletes channel after confirmation.

Transcript templates:
- transcript_placeholder.html: HTML transcript layout.
- verification_placeholder.html: RPG verification email template.

----------------------------------------------------------------
SECTION 9 - STAFF AND MODERATION
----------------------------------------------------------------

Staff ranks (managers/StaffRanksManager.ts):
- Default ranks and hierarchy positions:
	- Trial Support
	- Support
	- Intern
	- Trial Moderator
	- Moderator
	- Senior Moderator
	- Chief of Moderation
	- Probationary Administrator
	- Administrator
	- Head Administrator
	- Chief of Staff
	- Co-Owner
	- Owner
- Permissions per rank enforced via StaffRanksManager.

Staff commands:
- /staff set: assign or remove rank (Chief of Moderation+).
- /staff info: show rank.
- /staff list: list staff by rank.
- /staff cases: show warnings, bans, mutes with pagination.

Warnings and appeals:
- /warnings: view warnings (self or staff).
- /appeal: submit appeal for a warning.
- /stafftools reviewappeals: staff review.

Moderation logging:
- staff_audit_log stores staff actions across moderation and support workflows.

----------------------------------------------------------------
SECTION 10 - RPG SYSTEM
----------------------------------------------------------------

Registration and login:
- /register new: creates account, asks for password in DM, sends verification email.
- /register verify: verifies account with 6-digit code.
- /register resend: resend code with cooldown.
- /register info: show account info.
- /login: login with username/password, enforces single session.

RPG gameplay (commands/rpg.ts):
- /rpg create: create character with class.
- /rpg profile: show stats and equipment.
- /rpg stats: view or allocate stat points.
- /rpg inventory: view inventory.
- /rpg equip and /rpg unequip: manage equipment slots.
- /rpg rest: restore HP/MP with cooldown.
- /rpg battle: fight monsters by difficulty tier.
- /rpg leaderboard: top by level, gold, experience.
- /rpg adventure, /rpg work, /rpg gather, /rpg market, /rpg quest, /rpg gamble.

Shop and economy:
- /shop browse: list items by category.
- /shop buy: purchase item(s).
- /shop sell: sell inventory items.

Trading:
- /trade offer, view, cancel, accept, decline.
- Validates tradeability and equipped status.

Pets:
- /pet list, equip, unequip, feed, info, rename.

Crafting:
- /craft recipes, materials, create.

Dungeons:
- /dungeon list, enter, continue, status, abandon, history.

Achievements:
- /achievements list, progress.

Guilds:
- /guild create, info, invite, join, leave, donate, members, list.

Daily rewards:
- /daily: streak system and milestone bonuses.

RPG admin tools (commands/rpgmanage.ts and /stafftools rpg_*):
- Create/edit/delete items, achievements, pets, dungeons, materials.
- Initialize RPG data and seed content.
- Freeze, unfreeze, ban, unban accounts.
- Modify stats, change password, force logout.
- Give/remove items.

RPG initial data (rpg_init.ts):
- Seeds base shop items, equipment mappings, consumables.
- Seeds achievements, crafting materials, pets, and dungeons if empty.

----------------------------------------------------------------
SECTION 11 - COMMAND REFERENCE (ALL COMMANDS)
----------------------------------------------------------------

AI commands:
- /ai ask: single response with task choice (chat, math, programming, reasoning).
- /ai chat: VIP-only chat session with tool calling.
- /ai voice: VIP-only voice session in VC.
- /ai monitor: enable/disable/status configuration per guild.

Support commands:
- /support: create ticket.
- /stafftools tickets: list tickets with filters.
- /stafftools assign, priority, category, status.
- /globalmod closeticket: close ticket and generate transcripts.

Moderation commands:
- /filter setup, toggle, add, remove, view, search.
- /warnings: warning history (self or staff).
- /appeal: appeal warning.
- /kick: kick member (Kick Members permission).

Global moderation commands:
- /globalmod blacklist, unblacklist.
- /globalmod warn: category, points, expiry.
- /globalmod mute, unmute.
- /globalmod status.
- /globalmod search_user.

Staff commands:
- /staff set, info, list, cases.
- /stafftools auditlog, reviewappeals, notify.

Global chat commands:
- /globalchat set, toggle, autotranslate, language.
- Prefix: b.rules, b.help.

Utility commands:
- /setlang: set user language.
- /custom_responses add, remove, list.
- /avatar: show avatar.
- /gethtml: fetch HTML response and status.
- /ping: latency.
- /notifications: unread notification viewer.

Info commands:
- /botinfo: system and bot stats.
- /github: repo link.
- /privacy: privacy policy embed with links.
- /top: message count leaderboard.
- /userinfo: user info and message stats.

Fun commands:
- /meme: random meme (NSFW filtered).

Admin commands:
- /backupdb: database backup via mysqldump (high ranks only).
- /workers: worker pool stats.

RPG commands:
- /register new, verify, resend, info.
- /login.
- /rpg (create, profile, stats, inventory, equip, unequip, rest, battle, leaderboard, adventure, work, gather, market, quest, gamble).
- /shop browse, buy, sell.
- /trade offer, view, cancel, accept, decline.
- /pet list, equip, unequip, feed, info, rename.
- /craft recipes, materials, create.
- /dungeon list, enter, continue, status, abandon, history.
- /achievements list, progress.
- /guild create, info, invite, join, leave, donate, members, list.
- /daily.
- /rpgmanage (staff-only admin operations).

Owner-only prefix commands (index.ts):
- b.shutdown
- b.reboot
- b.status
- b.announce
- b.messages
- b.invite
- b.guilds
- b.eval
- b.sql
- b.cache
- b.active_guilds
- b.add_vip
- b.remove_vip
- b.vip_list
- b.fetch_guilds_members

----------------------------------------------------------------
SECTION 12 - WORKERS AND BACKGROUND TASKS
----------------------------------------------------------------

Worker manager (managers/WorkerManager.ts):
- Creates and manages workers by type.
- Keep-alive ping and latency tracking.
- Awaitable worker acquisition and response handling.

Translation worker (workers/translate.js):
- google-translate-api-x with cache and timeout.
- Windows DNS optimization.

Ratelimit worker (workers/ratelimit.js):
- Decrements user timers and ratelimit timers off the main thread.

Warning cleanup (WarningCleanup.ts):
- Periodic expiration of warnings by expires_at.

----------------------------------------------------------------
SECTION 13 - UTILITIES
----------------------------------------------------------------

utils.ts (high-level responsibilities):
- Encryption helpers (AES-256-CBC).
- Translation helpers and cache.
- Ratelimit worker integration.
- Discord helpers for permissions and safe responses.
- Knowledge source loading from knowledge/sources.json.
- AI tool execution entry points.
- Staff rank helpers.
- Ticket helpers and notification helpers.
- Project/workspace/log file access restricted to configured roots.

Audio utilities (utils/audioUtils.ts):
- stereoToMono
- resampleAudio
- wavToRawPCM
- validateAudioBuffer
- isWavFile
- getWavInfo
- prepareAudioForASR

----------------------------------------------------------------
SECTION 14 - POLICIES AND GOVERNANCE
----------------------------------------------------------------

Usage policy (usage_policy.md):
- Defines acceptable use and AI monitor scope.
- Lists AI tool permissions and restrictions.
- Global chat rate limits and anti-abuse rules.

Privacy policy (privacy.md):
- 2000+ line detailed policy describing data collection and retention.
- Explicit details for global chat encryption, tickets, and RPG data.

Security policy (SECURITY.md):
- Threat model and mitigation list.
- Vulnerability reporting and response targets.

Contribution guidelines (CONTRIBUTING.md):
- Setup, standards, and PR checklist.
- Notes about index.ts polyfills and command structure.

Code of conduct (CODE_OF_CONDUCT.md):
- Contributor Covenant 2.0.

----------------------------------------------------------------
SECTION 15 - FILE INVENTORY (ROOT)
----------------------------------------------------------------

Top-level files:
- ai.ts: exports AiManager instance.
- AIFunctions.ts: AI tool definitions.
- AIMonitorFunctions.ts: AI monitor tool definitions.
- ai_rules.json: AI rules for bot context.
- based.txt: attribution guidance for derivative bots.
- data.ts: shared data config and defaults.
- index.ts: main bot runtime.
- load_slash.ts: register slash commands.
- Log.ts: LogManager singleton.
- NVIDIAModels.ts: NVIDIAModelsManager instance.
- ProcessManager.ts: resilient runner.
- rpg_init.ts: RPG seed data.
- utils.ts: system utilities and AI tool handlers.
- WarningCleanup.ts: warning cleanup scheduler.
- Workers.ts: WorkerManager instance.
- package.json: dependencies and scripts.
- tsconfig.json: TypeScript settings.
- README.md: feature overview and setup.
- privacy.md, usage_policy.md, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
- transcript_placeholder.html: transcript template.
- verification_placeholder.html: RPG email template.

Directories:
- ai_workspace/: AI file workspace (tool-restricted).
- classes/: Collection implementation.
- commands/: slash command modules.
- database_backups/: backup files from /backupdb.
- knowledge/: knowledge sources and this document.
- logs/: runtime logs (rotated).
- managers/: system managers.
- mysql/: database connection and schema creation.
- protos/: Riva ASR/TTS proto files.
- types/: TypeScript interfaces.
- utils/: audio utilities.
- workers/: worker thread code.

----------------------------------------------------------------
SECTION 16 - COMMAND MODULE DETAILS (BY FILE)
----------------------------------------------------------------

commands/achievements.ts:
- /achievements list: list achievements by category.
- /achievements progress: show in-progress achievements.

commands/ai.ts:
- /ai ask: single response; supports task and think mode.
- /ai chat: VIP-only multi-message chat with tool calls.
- /ai voice: VIP-only voice with ASR/TTS.
- /ai monitor: configure AI monitor per guild.

commands/appeal.ts:
- /appeal warning_id reason: submit warning appeal.

commands/avatar.ts:
- /avatar target: show avatar.

commands/backupdb.ts:
- /backupdb public?: create mysqldump backup.

commands/botinfo.ts:
- /botinfo: host and bot metrics.

commands/craft.ts:
- /craft recipes, materials, create.

commands/customResponses.ts:
- /custom_responses add, remove, list.

commands/daily.ts:
- /daily: daily rewards and streaks.

commands/dungeon.ts:
- /dungeon list, enter, continue, status, abandon, history.

commands/filter.ts:
- /filter setup, toggle, add, remove, view, search.

commands/gethtml.ts:
- /gethtml url: fetch HTML and status.

commands/github.ts:
- /github: repo link.

commands/globalchats.ts:
- /globalchat set, toggle, autotranslate, language.

commands/globalmod.ts:
- /globalmod blacklist, unblacklist, warn, mute, unmute, status, closeticket, search_user.

commands/guild.ts:
- /guild create, info, invite, join, leave, donate, members, list.

commands/help.ts:
- /help category or command: dynamic help with pagination.

commands/kick.ts:
- /kick user: kicks user (Kick Members permission).

commands/login.ts:
- /login username password: starts RPG session.

commands/meme.ts:
- /meme: random meme from meme-api.com.

commands/notifications.ts:
- /notifications: view unread notifications.

commands/pet.ts:
- /pet list, equip, unequip, feed, info, rename.

commands/ping.ts:
- /ping: websocket and HTTP latency.

commands/privacy.ts:
- /privacy: privacy policy embed and links.

commands/register.ts:
- /register new, verify, resend, info.

commands/rpg.ts:
- /rpg create, profile, stats, inventory, equip, unequip, rest, battle, leaderboard,
	adventure, work, gather, market, quest, gamble.

commands/rpgmanage.ts:
- Staff-only RPG data management: items, achievements, pets, dungeons, materials.

commands/setlang.ts:
- /setlang language: set user language.

commands/shop.ts:
- /shop browse, buy, sell.

commands/staff.ts:
- /staff set, info, list, cases.

commands/stafftools.ts:
- /stafftools tickets, assign, priority, category, status, note, notes,
	search, auditlog, reviewappeals, notify, rpg_*.

commands/support.ts:
- /support message: create support ticket.

commands/top.ts:
- /top limit: message leaderboard.

commands/trade.ts:
- /trade offer, view, cancel, accept, decline.

commands/userinfo.ts:
- /userinfo user: user stats and permissions.

commands/warnings.ts:
- /warnings user include_expired: warning history.

commands/workers.ts:
- /workers: worker pool stats.

----------------------------------------------------------------
SECTION 17 - NOTES AND LIMITATIONS (AS IMPLEMENTED)
----------------------------------------------------------------

- AI chat uses VIP gating in /ai chat and /ai voice.
- AI monitor is configured per guild and requires Administrator permission.
- Global chat rate limits are enforced via ChatManager and ratelimit worker.
- Translation uses google-translate-api-x and may be rate-limited or timeout.
- RPG account passwords are encrypted with AES-256-CBC via utils.encryptWithAES.
- Global chat message content is encrypted at rest.
- Support tickets are routed to the configured home guild.
- Owner-only prefix commands are restricted by OWNERS env var.

----------------------------------------------------------------
END OF DOCUMENT
