# BarnieBot Usage Policy

Last Updated: February 12, 2026

## 1) Scope
BarnieBot operates inside Discord servers and DMs only. All use of the bot is subject to Discord's Terms of Service.

## 2) Access and Permissions
- You must have permission to configure the bot in a server.
- `/ai chat` and `/ai voice` are VIP-only unless you are an owner.
- `/ai monitor` configuration requires the Administrator permission.
- Many actions are permission-checked against staff rank and Discord permissions.
- Some AI tools are owner-only or restricted to staff/admins.

## 3) Acceptable Use
- Use the bot only for lawful, safe, and respectful activity.
- Do not use the bot for harassment, scams, doxxing, or impersonation.
- Do not attempt to bypass rate limits, spam protections, or staff permissions.
- Do not attempt to exploit, probe, or reverse-engineer bot systems.

## 4) AI Features
- `/ai ask` returns a single response to your question.
- `/ai chat` starts a chat session in the current channel. You can stop it by saying `stop ai`, `ai stop`, `stop chat`, or `end ai`.
- `/ai voice` requires you to be in a voice channel and processes your voice to generate a spoken response.
- Safety checks may end a session when content is flagged as unsafe.
- During AI chat, a single image attachment can be analyzed to describe the image.
- AI tool calls can fetch Discord data, database records, URLs, GitHub repository content, logs, and files under `ai_workspace/` when allowed by permissions.
- Tool usage is permission-checked. Owner-only tools are blocked for non-owners.

## 5) AI Monitor
- AI monitor is configured per guild with `/ai monitor` and requires a logs channel.
- It can analyze message create/update/delete/bulk delete, member add/remove/update, role create/update/delete, channel create/update/delete, invite create, webhook updates, and guild ban add/remove.
- Alerts are posted to the configured logs channel with risk, summary, and recommended actions.
- If `allow_actions` is enabled, it may delete messages, warn via DM, timeout, kick, or ban users.
- If `allow_investigation_tools` is enabled, it may use safe tools to fetch URL text and retrieve Discord context or warning history.
- Staff can mark cases as solved or run recommended actions from the alert.

## 6) Global Chat Network
- Global chat relays messages across connected guilds using webhooks.
- Links are sanitized for relay, and attachments are relayed as URLs when present.
- Auto-translation is supported based on guild language settings.
- Rate limits apply: 10 messages per 10 seconds, with a 60-second ratelimit when exceeded.
- Blacklisted or muted users are ignored in global chat.

## 7) Filters and Custom Responses
- Filters can remove flagged messages and optionally log them to a configured channel.
- Filtered content can be reposted via webhooks in a censored form.
- Custom responses can reply to exact or regex matches in a guild.

## 8) Moderation and Staff Controls
- Warnings, mutes, and bans are enforced by staff tools and permission checks.
- Warning appeals can be submitted and reviewed by staff.
- Staff actions are recorded in the audit log.

## 9) Support Tickets
- `/support` creates a ticket and logs the initial message to the database.
- Ticket channels are created in the configured home guild.
- Ticket messages are stored in the support transcript database and in generated transcripts on close.

## 10) RPG System Rules
- RPG accounts require email verification.
- Do not multi-account, share accounts, or automate gameplay.
- Exploits, duplication, or stat manipulation are not allowed.
- Staff may freeze or ban RPG accounts for abuse.

## 11) Availability and Limits
- The bot enforces rate limits and may temporarily block or ignore abuse patterns.
- Some features have timeouts or may return temporary unavailability messages under heavy load.

## 12) Enforcement and Appeals
- Violations may result in warnings, mutes, bans, or removal from global chat.
- AI monitor actions may apply when configured by guild administrators.
- Warnings can be appealed and reviewed by staff.

## 13) Contact
- Email: barniecorps@gmail.com
- GitHub: https://github.com/Barnie-Corps/barniebot

© 2026 BarnieCorps. All rights reserved.

