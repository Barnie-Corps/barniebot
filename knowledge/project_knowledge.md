# BarnieBot Project Knowledge

Last Updated: 2026-02-12

## Summary
BarnieBot is a multi-system Discord bot: global chat networking, AI chat/voice/vision, RPG gameplay, moderation, and support tickets. It uses Discord.js v14, Node.js 18+, MySQL, NVIDIA NIM for AI, and worker threads for translation and ratelimit tasks.

## Quick Start (Ops)
- Runtime: Node.js 18+, Discord.js v14, MySQL 5.7+.
- Key env: `TOKEN`, `DISCORD_BOT_ID`, `OWNERS`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `ENCRYPTION_KEY`, `NVIDIA_API_KEY`, `EMAIL_PASSWORD`.
- Optional env: `TRANSLATE_WORKERS`, `NOTIFY_STARTUP`, `SAFELY_SHUTTED_DOWN`, `REBOOTING`, `TEST`, `IGNORE_GLOBAL_CHAT`, `SEARCH_ENGINE_API_KEY`, `SEARCH_ENGINE_CX`.
- Start: `npm run start` (dev) or `npm run start:managed` (auto-restart + reboot flag handling).

## Core Systems

### AI
- Commands: `/ai ask`, `/ai chat` (VIP), `/ai voice` (VIP), `/ai monitor` (admin-only).
- Models: NVIDIA NIM for chat, safety, vision, and Riva ASR/TTS.
- AI tools: DB queries, Discord lookups, logs, workspace/project file operations, and support workflows.
- Safety: content safety model blocks unsafe content; AI Monitor can investigate and alert on suspicious activity.
- Boot tools: `get_user_data`, `get_memories`, and `fetch_ai_rules` are executed at the start of conversations.

#### AI Tool Access (Troubleshooting)
Read-only tools exist for:
- Filter configs/words and filter webhooks (by guild).
- AI monitor configs and case lists (by guild).
- Custom responses (list, lookup, and search).
- Global chat config per guild.

These tools are intended to support configuration checks without changing state.

### AI Monitor
- Configured per guild with `/ai monitor` (requires Admin and logs channel).
- Can analyze message create/update/delete and member/role/channel/invite/webhook events.
- Optional investigation tools and optional auto-actions (delete, warn, timeout, kick, ban).
- Alerts are posted to the configured logs channel.

#### AI Monitor Config Fields (DB)
- `enabled`, `logs_channel`, `allow_actions`, `analyze_potentially`, `allow_investigation_tools`, `monitor_language`.
- Cases are stored in `ai_monitor_cases` with risk, summary, recommended action(s), and status.

### Global Chat
- Encrypted cross-guild chat relay with optional auto-translation.
- Rate limits: 10 messages per 10 seconds; 60-second cooldown on abuse.
- Blacklist/mute enforcement blocks messages.

#### Global Chat Settings
- `/globalchat set` configures channel + webhook.
- `/globalchat toggle` enables/disables relay per guild.
- `/globalchat autotranslate` and `/globalchat language` control translations.
- Stored in `globalchats` (guild, channel, enabled, autotranslate, language, webhook_id/token).

### Support Tickets
- `/support` creates a ticket; channels created in home guild.
- Bi-directional relay between user and staff.
- Tracks first response time, priority, and category.
- Generates HTML/TXT transcripts on close.

#### Ticket Workflow Details
- Auto-assigns to available staff with lowest workload if staff status is `available`.
- Ticket embed is posted in home guild channel; original message ID stored for updates.
- Close flow generates TXT/HTML transcripts, updates ticket status, and can delete channel.

### Moderation & Staff
- Staff hierarchy with rank-based permissions.
- Global warnings, mutes, blacklists, and appeals.
- Audit logging for staff actions.

#### Staff Status + Audit
- `/stafftools status` updates staff availability in `staff_status`.
- `staff_audit_log` tracks key actions (warnings, mutes, ticket changes, notes).

### RPG
- Account registration and verification.
- Character progression, equipment, inventory, trading, and turn-based combat.
- Anti-abuse controls (freeze/ban, single-session enforcement).

#### RPG Data Highlights
- Accounts: `registered_accounts`, `logins`.
- Characters: `rpg_characters`, `rpg_sessions`, `rpg_account_status`.
- Items: `rpg_items`, `rpg_equipment`, `rpg_weapons`, `rpg_consumables`.
- Progression: `rpg_inventory`, `rpg_equipped_items`, `rpg_combat_logs`, `rpg_quests`, `rpg_character_quests`, `rpg_skills`, `rpg_character_skills`.
- Economy: `rpg_trades`, `rpg_market_listings`.

## Common Support Topics

### AI Access
- `/ai chat` and `/ai voice` are VIP-only unless user is owner.
- `/ai monitor` is admin-only and requires a logs channel.

### AI Safety and Monitoring
- AI safety checks may end conversations when content is unsafe.
- AI Monitor can be configured to alert or take automatic actions.

### Translation and Rate Limits
- Translation workers are prewarmed at startup.
- Global chat has hard rate limits and cooldowns.

### Tickets
- Tickets are not guild-specific; they route to the home guild.
- Transcripts are attached on ticket closure.

## Key Data Storage
- MySQL tables for users, guilds, warnings, staff, tickets, global chat, and AI monitor.
- Global chat messages are encrypted at rest (AES-256-CBC).
- Language preferences stored per user.

## Configuration Tables (Selected)
- `filter_configs`, `filter_words`, `filter_webhooks`: word filter settings + webhooks.
- `custom_responses`: guild-scoped custom command responses.
- `globalchats`: global chat channel + translation options.
- `ai_monitor_configs`, `ai_monitor_cases`: AI monitor config and alert history.
- `support_tickets`, `support_messages`: ticket lifecycle and transcripts.

## Permissions Overview
- `/ai monitor` requires Administrator and a logs channel.
- `/filter` requires Manage Messages; protected-word deletion requires Admin.
- `/custom_responses` requires Manage Guild.
- `/globalchat` requires Manage Channels.
- Owner-only prefix commands use `b.` and owner IDs from `OWNERS`.

## Useful References
- README.md: feature overview, commands, setup.
- usage_policy.md: acceptable use and AI monitor behavior.
- privacy.md: data collection and retention policy.

## Support Responses (Templates)
- No response from AI: "Oh no! I couldn't generate a reply. Try repeating what you said, maybe changing a couple of words."
- Unsafe content: "Your message was flagged as unsafe. Conversation cannot continue and it'll be ended."
- Voice errors: "Sorry, I encountered an error processing your voice."

## Operational Notes
- Global chat relays via webhooks and sanitizes links.
- AI chat can analyze one image attachment per message.
- `TEST=1` restricts commands to owners.
- Process manager handles reboot flags and startup notifications.

## Escalation Checklist
1. Verify user permissions and VIP status.
2. Check AI Monitor logs channel for alerts.
3. Confirm relevant configuration (global chat channel, logs channel, filters).
4. Review recent staff actions or warnings.
5. If needed, create or update a support ticket with transcript.

## File Map (Key)
- `commands/`: Slash commands and prefix command handlers.
- `managers/`: Core systems (AI, AI monitor, chat relay, workers).
- `mysql/queries.ts`: schema setup.
- `utils.ts`: AI tool handlers, translation cache, helpers.
