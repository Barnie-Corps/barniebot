# BarnieBot Project Knowledge

Last Updated: 2026-02-12

## Summary
BarnieBot is a multi-system Discord bot: global chat networking, AI chat/voice/vision, RPG gameplay, moderation, and support tickets. It uses Discord.js v14, Node.js 18+, MySQL, NVIDIA NIM for AI, and worker threads for translation and ratelimit tasks.

## Core Systems

### AI
- Commands: `/ai ask`, `/ai chat` (VIP), `/ai voice` (VIP), `/ai monitor` (admin-only).
- Models: NVIDIA NIM for chat, safety, vision, and Riva ASR/TTS.
- AI tools: DB queries, Discord lookups, logs, workspace/project file operations, and support workflows.
- Safety: content safety model blocks unsafe content; AI Monitor can investigate and alert on suspicious activity.
- Boot tools: `get_user_data`, `get_memories`, and `fetch_ai_rules` are executed at the start of conversations.

### AI Monitor
- Configured per guild with `/ai monitor` (requires Admin and logs channel).
- Can analyze message create/update/delete and member/role/channel/invite/webhook events.
- Optional investigation tools and optional auto-actions (delete, warn, timeout, kick, ban).
- Alerts are posted to the configured logs channel.

### Global Chat
- Encrypted cross-guild chat relay with optional auto-translation.
- Rate limits: 10 messages per 10 seconds; 60-second cooldown on abuse.
- Blacklist/mute enforcement blocks messages.

### Support Tickets
- `/support` creates a ticket; channels created in home guild.
- Bi-directional relay between user and staff.
- Tracks first response time, priority, and category.
- Generates HTML/TXT transcripts on close.

### Moderation & Staff
- Staff hierarchy with rank-based permissions.
- Global warnings, mutes, blacklists, and appeals.
- Audit logging for staff actions.

### RPG
- Account registration and verification.
- Character progression, equipment, inventory, trading, and turn-based combat.
- Anti-abuse controls (freeze/ban, single-session enforcement).

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

## Useful References
- README.md: feature overview, commands, setup.
- usage_policy.md: acceptable use and AI monitor behavior.
- privacy.md: data collection and retention policy.

## Support Responses (Templates)
- No response from AI: "Oh no! I couldn't generate a reply. Try repeating what you said, maybe changing a couple of words."
- Unsafe content: "Your message was flagged as unsafe. Conversation cannot continue and it'll be ended."
- Voice errors: "Sorry, I encountered an error processing your voice."

## Escalation Checklist
1. Verify user permissions and VIP status.
2. Check AI Monitor logs channel for alerts.
3. Confirm relevant configuration (global chat channel, logs channel, filters).
4. Review recent staff actions or warnings.
5. If needed, create or update a support ticket with transcript.
