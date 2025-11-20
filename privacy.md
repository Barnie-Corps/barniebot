# BarnieBot Privacy Policy

Last Updated: November 19, 2025

## Table of Contents
1. [Introduction](#introduction)
2. [Information We Collect](#information-we-collect)
3. [How We Use Your Information](#how-we-use-your-information)
4. [Data Retention](#data-retention)
5. [Data Security Measures](#data-security-measures)
6. [Third-Party Services](#third-party-services)
7. [Your Choices and Rights](#your-choices-and-rights)
8. [Children's Privacy](#childrens-privacy)
9. [Policy Updates](#policy-updates)
10. [Contact Us](#contact-us)

## Introduction
BarnieBot is a Discord bot developed by BarnieCorps. This Privacy Policy explains what information we collect, why we collect it, and how it is stored when you or your guild interact with the Bot or its web services.

## Information We Collect

### Core Discord Metadata
- Discord User ID, username, and discriminator for each interacting account.
- Avatar URLs cached for profile display (`discord_users` table).
- Guild IDs, channel IDs, and webhook identifiers for configured features.

### Operational Records
- Command executions (`executed_commands`, `message_count`): command name, user ID, timestamps, aggregate counts.
- Language preferences (`languages`): per-user language code.
- Global chat messages (`global_messages`): AES-256-CBC encrypted content, author ID, language code, timestamp.
- Filter configuration (`filter_configs`, `filter_words`, `filter_webhooks`).
- VIP subscriptions (`vip_users`): Discord ID, start/end epoch.
- Staff ranks (`staff`): user ID and rank string.
- Moderation actions:
	- Warnings (`global_warnings`): user ID, author ID, reason, timestamp.
	- Blacklists (`global_bans`): user ID, active flag, times counter.
	- Mutes (`global_mutes`): user ID, reason, author ID, creation timestamp, expiry (or 0 for indefinite).
- AI memories (`ai_memories`): user-added contextual memory strings.

#### Feature-Specific Notes
- **RPG System**: Comprehensive player data stored across 16 tables:
  - Account registration (`registered_accounts`): email (for verification), encrypted password (AES-256-CBC), verification status, last login timestamps, Discord UID linkage
  - Character data (`rpg_characters`): name, class, level, stats, gold, HP/MP, equipment, creation/activity timestamps
  - Session tracking (`rpg_sessions`): active login enforcement (one session per account), login timestamps, Discord UID
  - Account status (`rpg_account_status`): frozen/banned status, reasons, staff attribution, timestamps
  - Inventory & equipment (`rpg_inventory`, `rpg_equipped_items`): item ownership, quantities, acquisition timestamps
  - Shop items (`rpg_items`, `rpg_equipment`, `rpg_consumables`, `rpg_weapons`): item catalog and properties
  - Combat logs (`rpg_combat_logs`): battle outcomes, damage dealt, timestamps
  - Trading (`rpg_trades`): player-to-player trade history, items/gold exchanged, completion status
  - Quests & skills (`rpg_quests`, `rpg_character_quests`, `rpg_skills`, `rpg_character_skills`): quest progress and skill unlocks
  - Login history (`logins`): all login attempts with timestamps and status
- **Support Tickets**: Full ticket lifecycle data (`support_tickets`, `support_messages`, `ticket_attachments`):
  - User ID, initial message, status (open/closed), priority, category
  - Staff assignment, response times, channel IDs
  - Complete message transcripts with timestamps and staff attribution
  - Attachment metadata (filename, type, size, URL)
  - Closure details (who closed, when, HTML/TXT transcript generation)
- **AI Chat Sessions**: Conversation history ephemeral; cleared on session end or bot restart. Function call execution metadata (arguments, user IDs) may be logged for diagnostics, but not full transcripts.
- **Global Chat**: Messages encrypted (AES-256-CBC) before storage. Owner commands like `b.messages` can export decrypted logs for a specific user (moderation/abuse investigation only). Spoofed staff suffixes automatically stripped from non-staff before broadcast.
- **Staff System**: Multi-tier audit system:
  - Ranks and status stored with availability indicators
  - All moderation actions logged with full attribution and metadata
  - Internal notes system for user case management
  - Appeal review history with decision tracking
- **Email Delivery**: SMTP used for RPG registration verification and notifications; message bodies not retained after send.
- **Filter & Custom Responses**: Guild-controlled configurations; no cross-guild data sharing.

We do **not** collect Discord account passwords, payment card details, private DM content (outside support tickets and global chat network), or voice channel audio (AI voice mode processes in memory only).

## How We Use Your Information
- **Authentication**: Verify RPG account credentials, maintain single-session login enforcement, track last login activity.
- **Game Progression**: Store and update character stats, inventory, equipment, quest progress, combat history, and trading activity.
- **Support System**: Route tickets to appropriate staff, track response times, maintain conversation history, generate transcripts.
- **Moderation**: Track warnings/mutes/bans, process appeals, maintain staff audit logs, enforce global network rules.
- **AI Features**: Provide conversational AI via Google Gemini, execute function calls for server information, store user-defined memories.
- **Translation**: Auto-translate global chat messages using worker threads with Google Translate (`google-translate-api-x`).
- **Rate Limiting**: Prevent abuse through per-user command cooldowns and spam detection.
- **Email Notifications**: Send verification codes for account registration, ticket updates, and security alerts.
- **Analytics**: Aggregate command usage statistics for system optimization (no individual tracking).

We do **not** sell personal information. Limited metadata may be shared with Discord or law enforcement when required by applicable law or Terms of Service violations.

## Data Retention
- **Global chat logs**: Indefinite (encrypted; required for abuse investigation and moderation).
- **RPG accounts**: Indefinite while account exists; includes all character data, inventory, equipment, combat logs, trades.
  - Email addresses retained for account recovery
  - Passwords stored encrypted (AES-256-CBC)
  - Session history: 90 days rolling
  - Login attempts: 30 days rolling
- **Support tickets**: Indefinite for closed tickets (transcript preservation); active tickets until resolution.
  - Message transcripts archived permanently
  - Attachment metadata retained; files subject to Discord CDN retention
  - Staff assignment and response time metrics aggregated for performance analysis
- **Command executions & message counts**: Up to 90 days rolling.
- **Language preferences**: Retained while user active or until deletion request.
- **Moderation actions**:
  - Warnings: Permanent (required for repeat offense tracking and appeals)
  - Mutes: Auto-removed post-expiry; history retained for 1 year
  - Blacklists: Indefinite with active status flag
  - Staff audit log: Permanent (accountability and compliance)
- **AI memories**: User-controlled deletion via commands.
- **VIP records**: Retained through subscription + 1 year audit window.
- **Staff notes**: Indefinite (case management and user history).
- **Custom responses & filters**: Retained while guild uses bot; auto-deleted 90 days after bot removal.

Requests for deletion or export can be sent to barniecorps@gmail.com. We may decline deletion where retention is required for:
- Abuse investigation and pattern detection
- Legal obligations and Terms of Service enforcement
- Dispute resolution and appeal processing
- Persistent warning history and repeat offense tracking
- Staff accountability and audit compliance

**Account Deletion**: RPG accounts can be requested for deletion but require verification of ownership. Character data, trading history, and combat logs will be permanently removed. Moderation history may be retained in anonymized form.

## Data Security Measures
- AES-256-CBC encrypted global messages.
- Parameterized SQL queries.
- Worker thread isolation (no secrets across messages).
- Staff impersonation stripping in global dispatch.
- TLS-secured external service calls.

Despite these measures, no system can be 100% secure. Use BarnieBot at your own risk and avoid sharing highly sensitive information through its features.

## Third-Party Services
- Discord (platform & API)
- Google Gemini (AI chat/functions)
- Unofficial Google Translate wrapper (multilingual dispatch)
- Gmail SMTP (mail delivery)
- Meme API (optional `/meme` command)

These services receive the minimum necessary data to complete requests (for example, prompt text, translated message content). Each provider's privacy policy governs their handling of the data.

## Your Choices and Rights
- Request access to the data associated with your Discord ID.
- Correct language preferences or VIP status by using slash commands or contacting support.
- Request deletion of eligible records (global chat logs may be exempt where moderation requires retention).
- Opt out of the global chat by disabling it in your guild or leaving channels configured for the network.
- Decline to use AI or RPG features; those modules do not collect data unless invoked.

Submit verified requests by emailing barniecorps@gmail.com from the email address tied to the account or by opening a ticket on the support Discord server.

## Children's Privacy
BarnieBot is not directed to children under 13. If you believe we have collected information from a minor without appropriate consent, contact us so we can remove it.

## Policy Updates
We may revise this Privacy Policy to reflect new capabilities in `index.ts`, additional integrations, or regulatory requirements. Material changes are announced in the support Discord server and on GitHub. Continued use of the Bot after changes are posted constitutes acceptance.

## Contact Us
- Email: barniecorps@gmail.com
- Discord: r3tr00_ (direct handle)
- GitHub Issues: https://github.com/Barnie-Corps/barniebot/issues

By using BarnieBot you consent to the practices described in this Privacy Policy.

