# BarnieBot Privacy Policy

Last Updated: February 6, 2026

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
BarnieBot is a comprehensive Discord bot developed by BarnieCorps that provides global chat networking, AI assistance, RPG gaming systems, moderation tools, and support ticket management. This Privacy Policy provides detailed information about what data we collect, why we collect it, how it is processed and stored, how long we retain it, security measures in place, and your rights regarding your data when you or your Discord guild interact with the Bot.

By using BarnieBot, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy. If you do not agree with any part of this policy, please discontinue use of the Bot immediately.

**Scope**: This policy applies to all users interacting with BarnieBot through Discord commands, global chat participation, RPG system usage, support tickets, AI features, and any other bot functionality.

**Data Controller**: BarnieCorps acts as the data controller for all personal information collected through BarnieBot.

**Legal Basis**: We process your data based on:
- Legitimate interests in providing bot services and preventing abuse
- Contractual necessity for delivering requested features
- Consent for optional features like VIP subscriptions
- Legal obligations for moderation and safety enforcement

## Information We Collect

We collect and process various types of data to provide Bot functionality, ensure security, prevent abuse, and improve user experience. All data collection is limited to what is necessary for specific features you choose to use.

### Core Discord Metadata
Collected automatically when you interact with the Bot:

**User Identifiers**:
- Discord User ID (unique numerical identifier assigned by Discord)
- Discord username (your current display name)
- Discriminator (the #0000 tag, when applicable)
- Purpose: User identification, command attribution, feature access control
- Storage: `discord_users` table in MySQL database

**Profile Information**:
- Avatar URLs (links to your Discord profile picture)
- Purpose: Visual display in bot responses, leaderboards, profile commands
- Collection method: Fetched from Discord API when you execute commands
- Update frequency: Refreshed on each command execution
- Storage: Cached URLs in `discord_users` table, actual images hosted by Discord

**Guild Information**:
- Guild IDs (unique identifier for Discord servers)
- Guild names (server names for logging and display)
- Guild member counts (for statistics)
- Channel IDs where bot features are configured
- Purpose: Server-specific feature configuration, activity tracking, invite generation
- Storage: Various configuration tables (`globalchats`, `filter_configs`, `support_tickets`)

**Webhook Data**:
- Webhook IDs and tokens for content filtering message replacement
- Purpose: Sending filtered messages with original author appearance
- Storage: `filter_webhooks` table
- Security: Webhook tokens encrypted in database
- Lifecycle: Created on-demand, deleted when channel is removed

### Operational Records

**Command Execution Tracking**:
- Table: `executed_commands`
- Data collected:
  - Command name (slash command that was executed)
  - User ID (who executed the command)
  - Timestamp (UNIX epoch, when command was executed)
  - `is_last` flag (marks most recent command)
- Purpose: Usage analytics, abuse detection, feature popularity metrics
- Retention: Up to 90 days rolling window

**Message Count Statistics**:
- Table: `message_count`
- Data collected:
  - User ID
  - Total message count (aggregate of all messages sent)
  - Last updated timestamp
- Purpose: Activity tracking, leaderboard calculations, engagement metrics
- Update frequency: Real-time on each message in guild channels
- Retention: Indefinite while user is active

**Language Preferences**:
- Table: `languages`
- Data collected:
  - User ID
  - Language code (ISO 639-1 two-letter code: en, es, fr, de, pt, etc.)
- Purpose: Automatic translation of bot responses, personalized experience
- Default: English (en) if not set
- User control: Set via `/setlang` command, updated anytime
- Retention: Indefinite until user requests deletion

**Global Chat Messages**:
- Table: `global_messages`
- Data collected:
  - Message ID (unique identifier)
  - User ID (message author)
  - Encrypted message content (AES-256-CBC encryption)
  - Original language code
  - Timestamp (message send time)
  - Guild ID (origin server)
  - Channel ID (origin channel)
- Encryption: All message content encrypted at rest using AES-256-CBC with unique initialization vector per message
- Encryption key: 32-byte key stored in environment variable, never transmitted
- Purpose: Abuse investigation, moderation enforcement, pattern detection, cross-server relay
- Access: Owner commands can decrypt for specific users during investigations
- Retention: Indefinite (required for long-term abuse pattern analysis)
- Note: Attachments are not stored; only attachment metadata (URLs pointing to Discord CDN)

**Content Filter Configuration**:
- Tables: `filter_configs`, `filter_words`, `filter_webhooks`
- Data collected:
  - Guild ID
  - Filter enabled status (boolean)
  - Logging enabled status (boolean)
  - Log channel ID
  - Guild language preference
  - Filtered word list with:
    - Word content (the filtered term)
    - Single word flag (exact match vs substring)
    - Protected word flag (immune to deletion)
    - Creation timestamp
- Purpose: Server-specific content moderation, word replacement, automated filtering
- Access: Guild administrators with Manage Messages permission
- Retention: Deleted automatically 90 days after bot leaves guild

**VIP Subscription Records**:
- Table: `vip_users`
- Data collected:
  - User ID
  - Subscription start date (UNIX epoch milliseconds)
  - Subscription end date (UNIX epoch milliseconds)
- Purpose: Extended AI feature access, session duration enforcement
- Grant method: Owner command (`b.add_vip`)
- Expiration: Automatic on end date, row remains for 1-year audit period
- Renewal: Extends end date rather than creating new record

**Staff Hierarchy**:
- Table: `staff`
- Data collected:
  - User ID
  - Rank string (Support, Moderator, Senior Moderator, Chief of Moderation, Probationary Administrator, Administrator, Chief of Staff, Owner)
- Purpose: Permission enforcement, global moderation authority, command access control
- Automatic syncing: Owner IDs from environment variable auto-synced on bot startup
- Display: Rank suffix shown in global chat messages
- Retention: Indefinite while staff position active

**Moderation Actions**:

*Warnings System:*
- Table: `global_warnings`
- Data collected:
  - Warning ID (auto-increment)
  - User ID (warned user)
  - Author ID (staff who issued warning)
  - Reason (text explanation, max 1024 characters)
  - Category (spam, harassment, nsfw, hate_speech, impersonation, advertising, doxxing, raiding, disrespect, general)
  - Points (severity: 1-5 points)
  - Timestamp (creation time)
  - Active status (boolean)
  - Appeal fields:
    - `appealed` (boolean flag)
    - `appeal_reason` (user's appeal text)
    - `appeal_status` (pending/approved/denied)
    - `appeal_submitted_at` (timestamp)
    - `appeal_reviewed_by` (staff user ID)
    - `appeal_reviewed_at` (timestamp)
- Purpose: Track disciplinary history, enforce progressive sanctions, enable appeals
- Retention: Permanent (required for repeat offense tracking and appeal history)
- Visibility: Staff can view via `/staff cases`, users see own warnings
- Appeals: One appeal per warning via `/appeal` command

*Blacklist System:*
- Table: `global_bans`
- Data collected:
  - User ID
  - Active flag (boolean, can be toggled on/off)
  - Times counter (number of times blacklisted)
  - Creation timestamp
  - Last modified timestamp
- Purpose: Global chat network ban, prevents message sending across all connected guilds
- Enforcement: Automatic message blocking when active=true
- Toggle: Staff can blacklist/unblacklist without deleting history
- Retention: Indefinite with status tracking

*Mute System:*
- Table: `global_mutes`
- Data collected:
  - User ID
  - Reason (text explanation)
  - Author ID (staff who issued mute)
  - Creation timestamp
  - Until timestamp (0 for indefinite, epoch for timed)
  - Active status (computed from current time vs until)
- Purpose: Temporary or permanent global chat silencing
- Expiration: Automatic for timed mutes, manual unmute for indefinite
- Retention: Removed post-expiry, history kept for 1 year

**Staff Audit Log**:
- Table: `staff_audit_log`
- Data collected:
  - Staff ID (who performed action)
  - Action type (WARN, MUTE, UNMUTE, BLACKLIST, UNBLACKLIST, ASSIGN_TICKET, CLOSE_TICKET, SET_PRIORITY, SET_CATEGORY, SET_STATUS, ADD_NOTE, VIEW_TICKETS, VIEW_NOTES, SEARCH_TICKETS, VIEW_AUDIT_LOG, APPROVE_APPEAL, DENY_APPEAL, CREATE_NOTIFICATION, RPG_FREEZE, RPG_UNFREEZE, RPG_BAN, RPG_UNBAN, RPG_MODIFY_STATS, RPG_CHANGE_PASSWORD, RPG_LOGOUT, RPG_VIEW_INFO, RPG_GIVE_ITEM, RPG_REMOVE_ITEM)
  - Target ID (user affected by action, null for non-targeted actions)
  - Details (human-readable description of action)
  - Metadata (JSON object with action-specific data)
  - Created at (timestamp)
- Purpose: Staff accountability, action traceability, dispute resolution, compliance
- Access: Moderator+ rank via `/stafftools auditlog`
- Retention: Permanent (required for compliance and accountability)

**Staff Status Tracking**:
- Table: `staff_status`
- Data collected:
  - User ID
  - Status (available, busy, away, offline)
  - Status message (optional custom text)
  - Updated at (timestamp)
- Purpose: Ticket auto-assignment workload balancing, availability indication
- Update method: `/stafftools status` command
- Retention: Until staff member changes status or is removed

**Staff Notes**:
- Table: `staff_notes`
- Data collected:
  - User ID (subject of note)
  - Staff ID (author of note)
  - Note text (up to 2048 characters)
  - Created at (timestamp)
- Purpose: Internal case management, user history tracking, investigation records
- Access: Any staff member via `/stafftools notes`
- Retention: Indefinite (case management requires historical context)

**AI Chat Memories**:
- Table: `ai_memories`
- Data collected:
  - User ID
  - Memory content (user-provided context strings)
  - Creation timestamp
- Purpose: Persistent context for AI conversations, user-controlled information
- User control: Add via AI commands, delete anytime
- Retention: Until user deletes or requests data removal
- Note: Conversation history NOT stored; only user-added memories persist
- VIP subscriptions (`vip_users`): Discord ID, start/end epoch.
- Staff ranks (`staff`): user ID and rank string.
- Moderation actions:
	- Warnings (`global_warnings`): user ID, author ID, reason, timestamp.
	- Blacklists (`global_bans`): user ID, active flag, times counter.
	- Mutes (`global_mutes`): user ID, reason, author ID, creation timestamp, expiry (or 0 for indefinite).
- AI memories (`ai_memories`): user-added contextual memory strings.

### Feature-Specific Data Collection

#### RPG System
The RPG system is one of the most data-intensive features, requiring account creation and character progression tracking. Data is stored across 16 interconnected database tables:

**Account Registration** (`registered_accounts`):
- Username (unique, chosen by user)
- Email address (for verification only)
  - Purpose: Send 6-digit verification codes
  - Storage: Plain text in database
  - Usage: One-time verification, password recovery
  - Not shared: Never sold or provided to third parties
- Password (AES-256-CBC encrypted)
  - Encryption method: Advanced Encryption Standard with 256-bit key in CBC mode
  - Storage: Encrypted ciphertext with unique IV per password
  - Access: Never decrypted for display; only for login verification
  - Staff access: Admin+ can force password changes but cannot view current passwords
- Verification status (boolean)
- Verification code (6-digit numeric, temporary)
- Code expiration timestamp
- Account creation timestamp
- Last login timestamp
- Last user logged (Discord ID of most recent login)

**Character Data** (`rpg_characters`):
- Character ID (auto-increment primary key)
- Account ID (foreign key to registered_accounts)
- Character name (unique per account)
- Class (Warrior, Mage, Rogue, Paladin, Archer)
- Level (1-100+)
- Experience points (total accumulated)
- Gold (in-game currency)
- Current HP (health points)
- Maximum HP
- Current MP (mana/magic points)
- Maximum MP
- Base stats:
  - Strength (STR)
  - Defense (DEF)
  - Agility (AGI)
  - Intelligence (INT)
  - Luck (LUK)
- Stat points (unallocated points from leveling)
- Equipment slots (foreign keys to rpg_inventory items):
  - Weapon slot
  - Helmet slot
  - Armor slot
  - Gloves slot
  - Boots slot
  - Accessory slot 1
  - Accessory slot 2
- Character creation timestamp
- Last active timestamp
- Purpose: Game progression, stat management, equipment tracking

**Session Tracking** (`rpg_sessions`):
- Session ID
- Account ID
- Discord user ID (who is logged in)
- Logged in timestamp
- Active flag (enforces single-session per account)
- Purpose: Prevent multiple simultaneous logins, track active sessions, security enforcement

**Account Status** (`rpg_account_status`):
- Account ID
- Frozen flag (boolean)
- Frozen reason (staff-provided text)
- Frozen by (staff user ID)
- Frozen at (timestamp)
- Banned flag (boolean)
- Banned reason (staff-provided text)
- Banned by (staff user ID)
- Banned at (timestamp)
- Purpose: Account suspension management, enforcement tracking
- Staff command: `/stafftools rpg_freeze`, `/stafftools rpg_ban`

**Inventory System** (`rpg_inventory`):
- Inventory ID
- Character ID
- Item ID (foreign key to rpg_items)
- Quantity (for stackable items)
- Acquired at (timestamp)
- Bound flag (cannot be traded if true)
- Purpose: Item ownership tracking, trade validation

**Equipment Tables**:
- `rpg_equipped_items`: Currently equipped items with slot assignments
- `rpg_items`: Master item catalog (ID, name, description, rarity, stackable flag, tradeable flag)
- `rpg_equipment`: Equipment stats (base stats, requirements, level requirement, class requirement)
- `rpg_consumables`: Consumable items (HP restore amount, MP restore amount, buff effects)
- `rpg_weapons`: Weapon-specific data (damage, attack speed, critical chance, weapon type)
- Purpose: Item properties, stat calculations, requirement validation

**Combat Logs** (`rpg_combat_logs`):
- Log ID
- Character ID
- Monster name
- Difficulty tier (easy, normal, hard, nightmare)
- Damage dealt (total in battle)
- Damage received
- Experience gained
- Gold earned
- Victory flag (boolean)
- Timestamp
- Purpose: Battle history, drop tracking, progression analytics
- Retention: 30 days rolling, aggregated for statistics

**Trading System** (`rpg_trades`):
- Trade ID
- Initiator character ID
- Receiver character ID
- Initiator offers (JSON array of items and gold)
- Receiver offers (JSON array of items and gold)
- Status (pending, accepted, declined, cancelled, completed)
- Created at timestamp
- Completed at timestamp (if applicable)
- Purpose: Player-to-player economy, transaction history, dispute resolution
- Retention: 90 days after completion

**Quest System**:
- `rpg_quests`: Quest definitions (ID, name, description, rewards, requirements)
- `rpg_character_quests`: Quest progress per character (started, completed, failed timestamps)
- Purpose: Quest tracking, reward distribution, completion validation

**Skills System**:
- `rpg_skills`: Skill definitions (ID, name, description, class requirement, unlock level)
- `rpg_character_skills`: Skills unlocked per character (skill ID, learned at timestamp)
- Purpose: Ability progression, class-specific features

**Login History** (`logins`):
- Login ID
- Account ID
- Discord user ID
- Login timestamp
- Success flag (boolean)
- IP address (NOT stored - we don't track IPs)
- Purpose: Login audit trail, security monitoring
- Retention: Last 30 attempts per account

**RPG Data Retention Summary**:
- Account data: Indefinite while account exists
- Character data: Deleted when account deleted
- Session history: 90 days rolling
- Login attempts: 30 days rolling
- Combat logs: 30 days rolling, aggregated stats retained
- Trade history: 90 days after completion
- Inventory: Deleted with account
- Email addresses: Retained with account for recovery

**RPG Data Access**:
- User: Full access to own account via `/register info`, `/rpg profile`, `/rpg inventory`
- Staff (Moderator+): View account info via `/stafftools rpg_info`
- Staff (Admin+): Modify stats, freeze/ban accounts, force logout, change passwords
- Owners: Full database access

#### Support Ticket System
Comprehensive customer support with full message relay and transcript generation:

**Ticket Records** (`support_tickets`):
- Ticket ID (auto-increment)
- User ID (requester)
- Guild ID (origin server, null for DM tickets)
- Guild name (for display)
- Channel ID (created ticket channel in home guild)
- Message ID (initial ticket embed message)
- Initial message (user's opening request, up to 2000 characters)
- Status (open, closed)
- Priority (low, medium, high, urgent)
  - Set by staff via `/stafftools priority`
  - Affects assignment and response expectations
- Category (general, technical, billing, report, appeal)
  - Set by staff via `/stafftools category`
  - Used for routing and statistics
- Assigned to (staff user ID, null if unassigned)
  - Auto-assigned to available staff with lowest workload
  - Manual assignment via `/stafftools assign`
- Created at (timestamp)
- Closed at (timestamp, null if open)
- Closed by (user ID who closed ticket)
- First response at (timestamp of first staff message)
- First response by (staff user ID)
- Purpose: Support request tracking, workload distribution, SLA monitoring
- Retention: Indefinite for closed tickets (transcript preservation)

**Message Transcripts** (`support_messages`):
- Message ID (auto-increment)
- Ticket ID (foreign key)
- User ID (message author)
- Username (author's Discord tag at time of message)
- Content (full message text, up to 2000 characters)
- Timestamp (message send time)
- Is staff flag (boolean)
- Staff rank (rank at time of message, null for non-staff)
- Purpose: Complete conversation history, transcript generation, dispute resolution
- Storage: Plain text, not encrypted (internal support channel)
- Retention: Permanent with closed ticket

**Attachment Metadata** (`ticket_attachments`):
- Attachment ID
- Ticket ID
- Message ID (which message had the attachment)
- Filename (original file name)
- File type (MIME type)
- File size (bytes)
- URL (Discord CDN link)
- Uploaded by (user ID)
- Timestamp
- Note: Actual files hosted by Discord, only metadata stored in database
- Purpose: Track shared files, include in transcripts, reference for support
- Retention: Metadata permanent, actual files subject to Discord CDN retention

**Ticket Assignment Tracking**:
- Auto-assignment algorithm:
  - Filters staff by "available" status
  - Counts open tickets per staff member
  - Assigns to staff with lowest count
  - Falls back to any staff if none available
- Manual assignment tracked in staff_audit_log
- Reassignment allowed at any time

**Response Time Metrics**:
- First response time calculated as (first_response_at - created_at)
- Logged when first staff message sent to ticket
- Announced in ticket channel for accountability
- Used for performance analytics and SLA monitoring

**Transcript Generation**:
When ticket closed, two formats generated:

*TXT Transcript* (`transcript-{ticket_id}.txt`):
- Plain text format with headers:
  - Ticket ID
  - User (tag and ID)
  - Created timestamp (ISO 8601)
  - Closed timestamp (ISO 8601)
  - Duration (human-readable)
  - Closed by (tag and ID)
  - Origin (guild name/ID or "Direct Message")
  - Initial message
- Message history:
  - Format: `[timestamp] [RANK] username: content` (staff)
  - Format: `[timestamp] username: content` (user)
- All timestamps in ISO 8601 format

*HTML Transcript* (`transcript-{ticket_id}.html`):
- Styled webpage with:
  - Ticket metadata header with color-coded status
  - Message bubbles with avatars (first letter of username)
  - Staff messages with rank badges
  - Timestamps in local time format
  - Responsive design for viewing on any device
- Template: `transcript_placeholder.html`
- Generated dynamically with ticket data

**Transcript Delivery**:
- Posted to dedicated transcripts channel (ID: `data.bot.transcripts_channel`)
- Includes both TXT and HTML files as attachments
- Embed summary with:
  - Ticket ID and status
  - User information
  - Message count
  - Duration
  - Who closed the ticket
- Purpose: Staff reference, audit trail, quality assurance

**Ticket Closure Flow**:
1. Staff or user clicks "Close Ticket" button
2. Confirmation dialog shown
3. On confirm:
   - Generate transcripts (TXT + HTML)
   - Update ticket status to "closed"
   - Set closed_at and closed_by
   - Post transcripts to transcripts channel
   - Update original ticket embed to show "CLOSED" status
   - Send closure notification to user DM
   - Post closure message in ticket channel with "Delete Channel" button
4. Optional: Staff can delete channel 5 seconds after confirming

**Channel Deletion Safety**:
- Only staff can delete ticket channels
- Requires confirmation button click
- 5-second delay before deletion
- Transcripts already saved before deletion allowed

**Support Ticket Data Access**:
- User: View own active ticket via DM relay
- Staff: View all tickets via `/stafftools tickets`, search via `/stafftools search`
- Staff: View message history in ticket channels
- All: Access transcripts in transcripts channel after closure

#### AI Features
**Session Data** (ephemeral, not stored):
- Active AI chat sessions maintained in memory only
- Session contents:
  - User ID
  - Conversation history (NVIDIA model context, not user messages)
  - Turn count
  - VIP status check
  - Last activity timestamp
- Lifecycle: Created on `/ai chat`, cleared on session end or bot restart
- Purpose: Contextual conversation continuity
- Storage: None - entirely in-process memory
- Note: NO conversation history saved to database

**AI Memories** (persistent, see above):
- User-controlled contextual strings
- User adds via AI commands
- Used to augment prompts with persistent user preferences
- User can delete anytime

**AI Function Calls** (logged for diagnostics):
- Function name (e.g., "get_server_info", "get_user", "manage_guild")
- Function arguments (parameters passed)
- User ID (who invoked)
- Timestamp
- Purpose: Debug function execution, audit privileged operations
- Note: Full conversation NOT logged, only function metadata
- Retention: 7 days

**Voice Conversation** (ephemeral):
- Speech-to-text processing: Audio sent to NVIDIA Riva ASR, text returned
- Text-to-speech generation: Text sent to NVIDIA Riva TTS, audio returned
- No audio files stored
- No transcripts saved
- Voice channel activity: Tracked in voice state events, not persisted

#### Global Chat Network
**Message Processing**:
- All messages sent to configured global chat channels processed
- Encryption: AES-256-CBC before database insertion
- Encryption process:
  1. Generate random 16-byte initialization vector (IV)
  2. Encrypt message content with AES-256-CBC using bot encryption key + IV
  3. Prepend IV to ciphertext (IV:ciphertext format)
  4. Store in database
- Decryption: Only via owner command `b.messages <user_id>` for investigations

**Message Relay**:
- Message sent to all guilds with global chat enabled
- Format: `[RANK] username: content` (staff) or `username: content` (non-staff)
- Staff rank suffixes:
  - SUPPORT (Support)
  - MOD (Moderator)
  - SR MOD (Senior Moderator)
  - CoM (Chief of Moderation)
  - pADMIN (Probationary Administrator)
  - ADMIN (Administrator)
  - CoS (Chief of Staff)
  - OWNER (Owner)
- Anti-impersonation: Fake rank tags like `[MOD]` stripped from non-staff usernames

**Translation**:
- Optional auto-translate per guild
- Guild language set via `/globalchat language`
- Translation process:
  1. Detect source language (from user's language preference or auto-detect)
  2. Send to Google Translate API via `google-translate-api-x` library
  3. Translate to guild's target language
  4. Worker pool processes translations (5-10 workers)
  5. Cache translations for reuse (10-minute TTL)
- Circuit breaker: After 15 translation failures in 2 minutes, translations disabled temporarily

**Rate Limiting**:
- Per-user message limits:
  - Max: 10 messages per 10 seconds
  - Warning at: 9 messages
  - Rate limit at: 10+ messages
  - Rate limit duration: 60 seconds
- Tracked in-memory collection, decremented every second
- Purpose: Prevent spam, ensure fair usage

**Global Commands**:
- `b.rules [lang]`: Display global chat rules in specified language
- `b.help`: Show available global commands
- Processed before regular messages
- No rate limiting on informational commands

#### Content Filtering
**Filter Processing**:
- Triggered on every message in guilds with filter enabled
- Check sequence:
  1. Load filter configuration for guild
  2. Skip if filter disabled or user has Manage Messages permission
  3. Load filtered words list for guild
  4. Check message content against each word
  5. If match found:
     - Delete original message
     - Fetch or create webhook for channel
     - Re-send message via webhook with filtered content
     - Author appearance preserved (avatar, username)
     - Filtered words replaced with censored markers (e.g., `***`)
  6. If logging enabled:
     - Load log channel
     - Send filter log embed with original + filtered content

**Word Matching**:
- Single word mode: Exact word boundaries (`\bword\b` regex)
- Substring mode: Anywhere in message
- Case-insensitive matching
- Multiple words: Sorted by length (longest first) for proper replacement
- Protected words: Never deleted from configuration

**Webhook Management**:
- One webhook per channel (reused across messages)
- Created automatically on first filtered message
- Stored in `filter_webhooks` table
- Deleted if channel removed or bot leaves guild

**Filter Logs**:
- Posted to designated log channel
- Embed contains:
  - User mention and message channel mention
  - Original message content (unfiltered)
  - List of filtered words that matched
  - Timestamp
- Language: Log text translated to guild's filter language preference

#### Custom Responses
**Response Trigger**:
- Checked on every message in guilds with custom responses
- Match types:
  - Literal: Exact match (case-insensitive)
  - Regex: Pattern matching with regex engine
- Response: Bot replies with configured response text
- Purpose: Custom commands, auto-replies, guild-specific information

**Configuration**:
- Table: `custom_responses`
- Data: Guild ID, command trigger, response text, is_regex flag
- Access: Users with Manage Guild permission
- Commands: `/custom_responses add`, `/custom_responses remove`, `/custom_responses list`

#### Worker Pools
**Translation Workers**:
- Count: Environment variable `TRANSLATE_WORKERS` or CPU count (default 5-10)
- Function: Offload translation API calls from main event loop
- Initialization: Pre-warmed on bot startup (5 workers created immediately)
- Keep-alive: Jittered heartbeat every 750-1250ms to prevent worker death
- Metrics: Moving average latency tracking for performance monitoring
- Purpose: Prevent blocking, maintain responsiveness during translation bursts

**Rate Limit Worker**:
- Count: 1 worker
- Function: Offload user cache and timer decrement loops
- Fallback: If worker fails, processing falls back to main thread
- Purpose: Keep Discord event loop responsive during rate limit checks

**Worker Communication**:
- Messages: JSON objects with task data
- No secrets passed: Workers don't have access to encryption keys
- Error handling: Worker crashes logged, processing continues in main thread
- Lifecycle: Workers persist for bot lifetime unless crashed

#### Notifications System
**Global Notifications**:
- Table: `global_notifications`
- Data collected:
  - Notification ID
  - Content (message text, up to 2000 characters)
  - Language (source language code)
  - Created by (admin user ID)
  - Created at (timestamp)
- Delivery: Shown to users on next command execution
- Purpose: Important announcements, maintenance notices, policy updates
- Creation: Admin+ only via `/stafftools notify`
- Retention: Until marked as read by user or 30 days

#### Process Management
**Startup Tracking**:
- `SAFELY_SHUTTED_DOWN` flag (0 = crash, 1 = clean shutdown)
- `REBOOTING` flag (0 = normal start, 1 = intentional reboot)
- `NOTIFY_STARTUP` flag (1 = announce startup to global chat)
- Purpose: Detect crashes, announce unplanned restarts, confirm reboots

**Shutdown Procedures**:
- `b.shutdown`: Sets SAFELY_SHUTTED_DOWN=1, announces to global chat, graceful exit
- `b.reboot`: Sets REBOOTING=1, announces to global chat, exit code 1 (ProcessManager restarts)
- Automatic: Process crashes leave SAFELY_SHUTTED_DOWN=0

**ProcessManager** (optional):
- Auto-restart on crashes
- Detects crash patterns
- Reboot completion announcement when REBOOTING=1 on startup
- Purpose: High availability, automatic recovery

We do **not** collect:
- Discord account passwords
- Payment card details
- Private DM content (except support tickets and global chat participation)
- Voice channel audio files
- IP addresses
- Geolocation data
- Email addresses beyond RPG verification
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

We use the collected information for the following specific purposes, always limited to what is necessary for each feature:

### Service Delivery & Feature Operation
**Authentication & Access Control**:
- Verify RPG account credentials during login
- Enforce single-session limitation (one active login per account)
- Track last login activity for security monitoring
- Validate staff ranks for command authorization
- Check VIP status for AI feature access gates

**Game Progression**:
- Store and update character stats (level, experience, HP, MP, STR, DEF, AGI, INT, LUK)
- Manage inventory contents (items, quantities, acquisition dates)
- Track equipped items and calculate total stats including equipment bonuses
- Record quest progress and completion status
- Log combat encounters and outcomes
- Process player-to-player trades with validation
- Distribute rewards (experience, gold, items) from battles and quests

**Support System**:
- Route tickets to appropriate staff based on availability and workload
- Track response times for SLA monitoring and staff performance metrics
- Maintain complete conversation history for context continuity
- Generate transcripts for record-keeping and quality assurance
- Enable ticket assignment, priority, and category management
- Send notifications to users and staff about ticket updates

**Moderation & Safety**:
- Track warnings, mutes, and blacklists for repeat offense identification
- Process appeals with full review workflow and decision tracking
- Enforce global network rules across all connected guilds
- Maintain staff audit logs for accountability and compliance
- Detect and prevent abuse patterns through message history analysis
- Block impersonation attempts by stripping fake staff tags

**AI Features**:
- Provide conversational AI via NVIDIA AI models with contextual understanding and function calling capabilities
- Execute function calls for server information retrieval, user lookups, guild management
- Store user-defined memories for persistent context across sessions
- Generate AI responses tailored to conversation history (session-only, not stored)
- Process voice conversations with speech-to-text and text-to-speech

**Global Chat Network**:
- Relay messages across all connected guilds in real-time
- Auto-translate messages based on per-guild language settings
- Display staff rank suffixes for role identification
- Apply rate limiting to prevent spam and ensure fair usage
- Encrypt message content before storage for privacy protection
- Enable cross-server community building

**Translation Services**:
- Auto-translate global chat messages using worker thread pools
- Translate bot responses to user's preferred language
- Process custom language commands (like `b.rules es`)
- Cache translations to minimize API calls and improve performance

**Content Filtering**:
- Scan messages against guild-specific filtered word lists
- Delete original messages and re-send via webhook with filtered content
- Preserve author appearance (avatar, nickname) in filtered messages
- Log filter actions to designated channels for moderator review
- Protect against accidental or malicious word additions

**Command Processing**:
- Track command executions for usage analytics and abuse detection
- Count messages for activity leaderboards and engagement metrics
- Apply rate limits to commands to prevent API abuse
- Record command history for debugging and support

**Email Delivery**:
- Send 6-digit verification codes for RPG account registration
- Deliver one-time codes with 10-minute expiration
- Optional: Send notifications about account changes (if implemented)
- Note: Email contents not retained after sending; only delivery status logged

### Analytics & Optimization
**Aggregate Statistics**:
- Command popularity metrics (which commands used most frequently)
- Feature adoption rates (how many users use each system)
- Guild activity levels (messages sent, users active)
- RPG progression statistics (average level, gold distribution, popular classes)
- Support ticket volume and resolution times
- AI usage patterns (session durations, function call frequency)

**Performance Monitoring**:
- Translation API latency and error rates
- Worker pool health and task completion times
- Database query performance
- Memory usage and garbage collection patterns
- Rate limit trigger frequencies
- Filter processing delays

**Important**: We do NOT perform individual user tracking or behavioral profiling. All analytics are aggregated and anonymized. We do not sell, rent, or trade personal information to third parties for marketing purposes.

### Security & Abuse Prevention
**Fraud Detection**:
- Monitor for suspicious login patterns (though not IP-based)
- Detect rapid account creation attempts
- Identify spam patterns in global chat
- Track repeated rule violations
- Analyze trade patterns for economy exploitation

**Security Enforcement**:
- Automatically freeze accounts showing suspicious activity
- Block users from global chat network for Terms of Service violations
- Enforce progressive discipline (warnings → mutes → blacklists)
- Validate equipment and item ownership before trades
- Prevent stat manipulation and item duplication exploits

### Legal Compliance & Dispute Resolution
**Terms of Service Enforcement**:
- Maintain moderation records for Terms violations
- Document staff actions for accountability
- Preserve appeal submissions and decisions
- Generate audit trails for investigations

**Dispute Resolution**:
- Access conversation histories in support tickets
- Review moderation action context and reasoning
- Investigate user reports of abuse or misconduct
- Provide evidence for Discord Trust & Safety reports when required by law

**Regulatory Compliance**:
- Respond to valid legal requests for user data
- Maintain records as required by applicable laws
- Honor data deletion requests where legally permissible
- Provide data exports upon verified user request

### Communication
**User Notifications**:
- Inform users of warning appeals decisions
- Notify about RPG account status changes (frozen, banned, password changed)
- Alert about support ticket updates and closures
- Announce bot maintenance and feature updates via global chat

**Staff Communication**:
- Assign tickets to staff members with notifications
- Alert about high-priority tickets requiring urgent attention
- Share audit log entries for oversight
- Distribute global notifications from administrators

We do **not** use your data for:
- Selling to data brokers or advertisers
- Cross-platform tracking or profiling
- Training AI models (your conversations are not used to improve AI models beyond the session)
- Marketing campaigns or promotional emails
- Sharing with third parties except as required by law or as described in this policy

## Data Retention

We retain different types of data for varying periods based on legal requirements, operational needs, and the nature of the data. Below is a comprehensive breakdown of retention periods for all data categories:

### Indefinite Retention
**Global Chat Messages**:
- Retention: Indefinite
- Reason: Required for long-term abuse investigation, pattern detection across extended time periods, and historical moderation context
- Format: Encrypted (AES-256-CBC)
- Access: Only via owner command `b.messages <user_id>` for investigations
- Note: Critical for tracing harassment campaigns, spam networks, and coordinated abuse that may span months or years

**Warning Records**:
- Retention: Permanent
- Reason: Essential for repeat offense tracking, appeal history, and progressive discipline enforcement
- Includes:
  - Original warning details (reason, issuer, timestamp)
  - Appeal submissions and staff decisions
  - Points assigned and category classification
- Access: Staff via `/staff cases`, users via warnings commands
- Important: Permanent retention necessary because users may return after extended absences; without history, repeat offenses cannot be identified

**Staff Audit Log**:
- Retention: Permanent
- Reason: Accountability and compliance requirements
- Purpose: Track all staff actions for oversight, dispute resolution, performance review
- Cannot be deleted: Ensures transparency and prevents evidence tampering
- Access: Moderator+ via `/stafftools auditlog`

**RPG Accounts (Active)**:
- Retention: Indefinite while account exists
- Includes:
  - Account registration data (username, email, encrypted password)
  - Character data (stats, level, experience, gold, equipment)
  - Inventory contents
  - Quest and skill progress
- Deletion: Only upon explicit user request with identity verification
- Email addresses: Retained for account recovery purposes

**Support Ticket Transcripts (Closed)**:
- Retention: Indefinite
- Reason: Quality assurance, dispute resolution, training material, compliance
- Format: Both TXT and HTML transcripts stored
- Includes: Complete message history with timestamps and staff attribution
- Access: Staff via transcripts channel
- Purpose: Reference for recurring issues, staff training, pattern analysis

**Blacklist Records**:
- Retention: Indefinite with active status flag
- Reason: Prevent ban evasion, track repeat violators
- Status: Can toggle active/inactive without deleting history
- Times counter: Tracks number of times user has been blacklisted
- Purpose: Identify users who repeatedly violate rules after unbans

**Staff Notes**:
- Retention: Indefinite
- Reason: Case management requires historical context across extended time periods
- Purpose: Track user behavior patterns, document interventions, maintain institutional knowledge
- Access: All staff via `/stafftools notes`

### Time-Limited Retention

**Command Execution Logs**:
- Retention: 90 days rolling
- Purpose: Recent usage analytics, abuse detection
- Automatic purge: Records older than 90 days deleted automatically
- Includes: Command name, user ID, timestamp
- Note: Aggregate statistics may be retained indefinitely

**Message Count Statistics**:
- Retention: While user active, then 90 days after last message
- Resets: Never (cumulative)
- Purpose: Leaderboards, engagement tracking
- Deletion: Upon user request or account inactivity

**RPG Session History**:
- Retention: 90 days rolling
- Includes: Login timestamps, Discord user IDs, session durations
- Purpose: Recent activity tracking, anomaly detection
- Automatic purge: Sessions older than 90 days removed

**RPG Login Attempts**:
- Retention: 30 days rolling
- Includes: Last 30 attempts per account
- Purpose: Security monitoring, brute force detection
- Automatic purge: Attempts older than 30 days removed
- Note: Success/failure status tracked

**RPG Combat Logs**:
- Retention: 30 days rolling for detailed logs
- Aggregated statistics: Retained indefinitely
- Includes: Monster encounters, damage dealt/received, rewards, outcomes
- Purpose: Game balance analysis, progression tracking
- Automatic purge: Individual logs older than 30 days deleted, aggregates preserved

**RPG Trade History**:
- Retention: 90 days after trade completion
- Includes: All trade details (participants, items exchanged, gold amounts, timestamps)
- Purpose: Dispute resolution, economy monitoring, exploit detection
- Automatic purge: Completed trades older than 90 days removed
- Pending trades: Retained until completed, accepted, declined, or cancelled

**Mute Records (Expired)**:
- Retention: 1 year after expiration
- Purpose: Appeal reference, pattern detection
- Auto-removal: After 1-year retention period
- Active mutes: Retained indefinitely until unmuted

**VIP Subscription Records**:
- Retention: Duration of subscription + 1 year audit window
- Includes: Start date, end date, user ID
- Purpose: Billing verification, renewal processing, audit compliance
- Post-expiration: Kept for 1 year then deleted
- Reason: Supports dispute resolution and subscription history queries

**AI Function Call Logs**:
- Retention: 7 days
- Includes: Function name, arguments, user ID, timestamp
- Purpose: Debugging, audit of privileged operations
- Note: Full conversation history NOT logged
- Automatic purge: Logs older than 7 days deleted

**Filter Configurations & Custom Responses**:
- Retention: While guild uses bot, then 90 days after bot removal
- Includes: Filtered words, custom commands, filter settings
- Automatic deletion: 90 days after bot leaves guild
- Purpose: Allow time for bot re-addition without losing configuration
- User control: Guild admins can delete anytime

**Global Notifications**:
- Retention: Until marked as read by user OR 30 days, whichever comes first
- Purpose: Ensure important announcements reach users
- Automatic purge: Read notifications deleted immediately, unread after 30 days

### Immediate Deletion

**AI Chat Sessions**:
- Retention: None (ephemeral)
- Storage: In-memory only during active session
- Cleared: On session end, bot restart, or inactivity timeout
- Purpose: Real-time conversation context only
- Note: User memories persist separately (see above)

**Voice Conversation Audio**:
- Retention: None
- Process: Audio sent to NVIDIA Riva for processing, response returned, no storage
- Transcripts: Not saved
- Purpose: Real-time voice interaction only

**Verification Codes (RPG Registration)**:
- Retention: 10 minutes or until used
- Purpose: One-time email verification
- Automatic expiry: Invalid after 10 minutes or successful verification
- Storage: Temporary in database, overwritten on regeneration

**Password Reset Tokens** (if implemented):
- Retention: 1 hour or until used
- Purpose: Secure password reset flow
- Automatic expiry: Invalid after use or 1 hour
- Single-use: Consumed on first valid use

### Deletion Exceptions
We may decline deletion requests or extend retention periods in the following circumstances:

**Abuse Investigation**:
- Active moderation cases require preservation of evidence
- Global chat logs may be exempt where harassment investigation ongoing
- Warning records cannot be deleted to prevent manipulation of disciplinary history

**Legal Obligations**:
- Court orders or legal holds requiring data preservation
- Law enforcement requests with proper legal authority
- Discord Terms of Service violation evidence for platform safety

**Dispute Resolution**:
- Open appeals require preservation of original warning and context
- Support tickets with ongoing issues must retain transcripts
- Trade disputes require transaction history until resolved

**Persistent Warning History**:
- Warning records cannot be deleted even after appeal approval
- Appeal status updated to "approved" and warning marked inactive
- History retained to identify patterns if user receives future warnings
- Critical for enforcement of progressive discipline policies

**Staff Accountability**:
- Audit log entries cannot be deleted
- Staff notes may be redacted but not removed
- Ensures institutional knowledge and prevents abuse of power

### User-Initiated Deletion
**RPG Account Deletion**:
- Process: Email request to barniecorps@gmail.com with identity verification
- Verification required: Must prove ownership through account credentials or email
- Scope: Deletes all character data, inventory, quests, skills, equipment, trade history
- Preserved: Moderation history may be retained in anonymized form
- Timeframe: Processed within 30 days of verified request
- Irreversible: Cannot be undone; all progress permanently lost

**Language Preferences**:
- Deletion: Contact barniecorps@gmail.com or use future self-service option
- Effect: Resets to default (English)
- Timeframe: Immediate upon request

**AI Memories**:
- Deletion: User-controlled via AI commands
- Effect: Removes user-added context from future sessions
- Timeframe: Immediate

**Staff Notes (Redaction)**:
- Request: Users can request review of notes about them
- Process: Staff may redact sensitive information upon justified request
- Cannot delete: Notes retained for case management, but personally identifying details may be redacted

### Automated Data Purging
**Daily Cleanup Jobs**:
- Expired verification codes removed
- Expired VIP subscriptions flagged (row kept for audit)
- Old combat logs aggregated and detailed logs deleted
- Command execution logs beyond 90 days purged

**Weekly Cleanup Jobs**:
- Inactive RPG sessions (no activity for 7+ days) marked inactive
- Unread notifications beyond 30 days deleted
- Filter configurations for removed guilds (if 90 days passed) deleted

**Monthly Cleanup Jobs**:
- Aggregate statistics recomputed
- Dead webhook references cleaned up
- Expired rate limit cache entries purged from database backups

### Backup Retention
**Database Backups**:
- Frequency: Daily
- Retention: Last 30 days of backups kept
- Purpose: Disaster recovery, data corruption protection
- Security: Encrypted with same AES-256 key as production
- Storage: Offsite secure location (details not disclosed for security)
- Restoration: Only in case of catastrophic failure or data corruption

**Transcript Archives**:
- Frequency: Real-time (generated on ticket close)
- Retention: Permanent with ticket record
- Format: TXT and HTML files
- Storage: In dedicated transcripts channel
- Access: Staff only

### Data Portability
Upon verified request, users can receive:
- Their RPG account data (JSON export)
- Their global chat message history (decrypted TXT file)
- Their warning and moderation history
- Their command execution history
- Their AI memories

**Request Process**:
1. Email barniecorps@gmail.com with Discord ID
2. Verify identity through Discord account or email
3. Specify data categories desired
4. Receive data export within 30 days
5. Format: JSON, CSV, or TXT based on data type

**Important**: Data exports may exclude information that could compromise other users' privacy or reveal security mechanisms.

## Data Security Measures

We implement multiple layers of security controls to protect your data from unauthorized access, disclosure, alteration, and destruction. While no system can guarantee 100% security, we employ industry-standard and advanced techniques to safeguard your information.

### Encryption

**Data at Rest**:
- **Global Chat Messages**: AES-256-CBC encryption
  - Algorithm: Advanced Encryption Standard with 256-bit key in Cipher Block Chaining mode
  - Key storage: 32-byte encryption key stored in environment variable, never transmitted or logged
  - Initialization Vector: Unique random 16-byte IV generated per message
  - Format: `IV:ciphertext` stored in database
  - Decryption: Only via owner command for moderation investigations
  - Key rotation: Encryption key never rotated (would invalidate all historical messages)
  
- **RPG Account Passwords**: AES-256-CBC encryption
  - Same encryption algorithm as global messages
  - Unique IV per password
  - Never decrypted for display; only for login verification
  - Password changes: Old encrypted password replaced, not decrypted
  - Staff access: Admin+ can force password reset but cannot view current passwords
  
- **Database Encryption**:
  - Connection: TLS 1.2+ encryption for all database connections
  - Storage: Encrypted fields stored as binary blobs
  - Backup encryption: Database backups encrypted with same AES-256 key
  - Key management: Encryption keys stored separately from database

**Data in Transit**:
- **Discord API**: All communications use HTTPS with TLS 1.2+
- **Google Translate API**: HTTPS with TLS 1.2+
- **NVIDIA Riva APIs**: gRPC with TLS encryption
- **Gmail SMTP**: TLS encryption (STARTTLS)
- **Webhook Delivery**: HTTPS with Discord's TLS implementation
- **Internal Services**: No unencrypted connections allowed

### Access Control

**Authentication**:
- **Bot Token**: Discord bot token stored in environment variable, never hardcoded
- **API Keys**: All third-party API keys in environment variables
- **Database Credentials**: Username/password in environment variables
- **Owner Verification**: Discord IDs validated against environment variable list
- **Staff Ranks**: Database-driven hierarchy with auto-sync for owners

**Authorization**:
- **Command Permissions**: Slash commands restricted by required Discord permissions
- **Staff Hierarchy**: Eight-tier system with escalating privileges
  - Support: Basic ticket access, cannot moderate
  - Moderator: Issue warnings, view cases
  - Senior Moderator: Enhanced moderation
  - Chief of Moderation: Manage lower ranks, full moderation authority
  - Probationary Administrator: Trial admin access
  - Administrator: Full administrative powers
  - Chief of Staff: Staff leadership, all features
  - Owner: Bot operators, database access, owner commands
- **Feature Gates**: VIP status checked per-command for AI features
- **RPG Single-Session**: Only one active login per account enforced in database
- **Guild Permissions**: Filter/custom response management requires Discord Manage Messages/Manage Guild permissions

**Privilege Escalation Prevention**:
- Staff cannot modify peers or superiors in hierarchy
- Owner ranks automatically synced from environment variable (cannot be demoted by other staff)
- Command authorization checked before execution
- Database constraints enforce foreign key relationships
- RPG admin commands require Admin+ staff rank

### Input Validation & Sanitization

**SQL Injection Prevention**:
- **Parameterized Queries**: All database queries use parameterized statements
- **No String Concatenation**: SQL never constructed by string concatenation
- **ORM Patterns**: Database library handles escaping automatically
- **Example**: `db.query("SELECT * FROM users WHERE id = ?", [userId])`
- **Input Validation**: User IDs, Discord IDs validated as numeric before queries

**Command Injection Prevention**:
- **No Shell Commands**: Bot does not execute system commands with user input
- **Process Isolation**: Worker threads isolated from main process
- **Eval Restriction**: `b.eval` command restricted to owners only
- **Code Execution**: Owner-only, not accessible to normal users

**Cross-Site Scripting (XSS) Prevention**:
- **HTML Transcripts**: User input escaped before HTML generation
- **Embed Content**: Discord embeds auto-escape user content
- **No User-Generated HTML**: Users cannot inject HTML/JavaScript

**Regex Denial of Service (ReDoS) Prevention**:
- **Custom Response Regex**: Try-catch blocks around regex execution
- **Timeout**: Regex matching has implicit timeout from event loop
- **Validation**: Malformed regex patterns caught and logged as errors

### Network Security

**HTTPS Agent Configuration**:
- **Keep-Alive**: Connection pooling reduces TLS handshake overhead
- **Max Sockets**: Limited to 50-150 connections based on platform
- **Timeout**: 30-second timeout prevents hanging connections
- **FIFO Scheduling**: Fair request ordering on Windows platform
- **DNS Optimization**: Windows uses system resolver for better DNS caching

**Rate Limiting**:
- **Per-User Limits**: 10 messages per 10 seconds in global chat
- **Graduated Response**: Warning at 9 messages, rate limit at 10+
- **Rate Limit Duration**: 60-second cooldown period
- **Command Cooldowns**: Anti-spam measures on specific commands
- **API Rate Limits**: Respect Discord API rate limits with exponential backoff

**DDoS Mitigation**:
- **Discord's Infrastructure**: Primary protection through Discord's CDN and API
- **Message Queues**: Outgoing messages queued to prevent overwhelming Discord API
- **Circuit Breakers**: Translation circuit breaker after 15 failures in 2 minutes
- **Worker Pools**: Background processing prevents main event loop blocking

### Data Integrity

**Database Constraints**:
- **Primary Keys**: Auto-increment IDs for all tables
- **Foreign Keys**: Enforced relationships between tables
- **Unique Constraints**: Username uniqueness, single sessions
- **Not Null**: Required fields enforced at database level
- **Check Constraints**: Value ranges validated (e.g., level >= 1)

**Transaction Handling**:
- **ACID Compliance**: MySQL InnoDB engine ensures atomicity, consistency, isolation, durability
- **Rollback**: Failed transactions automatically rolled back
- **Batch Operations**: Multiple related updates in single transaction
- **Deadlock Detection**: Database automatically detects and resolves deadlocks

**Backup Integrity**:
- **Daily Backups**: Automated daily database dumps
- **Checksum Verification**: Backup files checksummed for corruption detection
- **Encryption**: Backups encrypted with same AES-256 key as production
- **Retention**: 30-day rolling backup window
- **Testing**: Regular restore tests to verify backup integrity

### Application Security

**Dependency Management**:
- **Package Lock**: `package.json` and lock files track exact versions
- **Vulnerability Scanning**: Periodic checks for known CVEs in dependencies
- **Update Policy**: Security updates applied promptly
- **Minimal Dependencies**: Only necessary packages included

**Error Handling**:
- **Graceful Degradation**: Failures in non-critical features don't crash bot
- **Sensitive Data Redaction**: Error logs don't contain passwords, tokens, or encryption keys
- **User Error Messages**: Generic error messages to users, detailed logs server-side
- **Log Files**: Stored in `logs/` directory with error details and stack traces
- **File Attachments**: Error logs attached to user responses for support

**Code Security**:
- **TypeScript**: Strong typing reduces runtime errors
- **No Eval in Production**: User input never passed to eval except owner `b.eval` command
- **Linting**: Code linting enforces security best practices
- **Code Reviews**: Pull requests reviewed before merge (if applicable)

### Impersonation Protection

**Staff Suffix Stripping**:
- Non-staff usernames automatically have fake staff tags removed
- Patterns matched: `[MOD]`, `[ADMIN]`, `[OWNER]`, `[SUPPORT]`, etc.
- Regex: `/\[(MOD|ADMIN|OWNER|SUPPORT|CoM|pADMIN|CoS|SR MOD)\]/gi`
- Enforcement: Before message relay in global chat
- Purpose: Prevent users from impersonating staff

**Rank Verification**:
- Staff ranks stored in database, queried on command execution
- Cache: 5-minute TTL cache to reduce database queries
- Auto-sync: Owner ranks synchronized on bot startup
- Display: Only verified staff get rank suffixes in global chat

**Account Verification (RPG)**:
- Email verification required before account fully functional
- 6-digit codes with 10-minute expiration
- Single-session enforcement prevents account sharing
- Password required for login (no "remember me" tokens)

### Monitoring & Incident Response

**Logging**:
- **Action Logs**: All staff actions logged to `staff_audit_log`
- **Error Logs**: Application errors saved to `logs/` directory with timestamps
- **Console Logs**: Structured logging with component labels and severity levels
- **Log Levels**: Info, Warning, Error categorization
- **Log Retention**: Log files rotated daily, kept for 90 days

**Anomaly Detection**:
- **Login Patterns**: Unusual login attempts logged (though not IP-based)
- **Rate Limit Triggers**: Frequent rate limit hits logged
- **Command Patterns**: Unusual command usage patterns logged
- **Trade Monitoring**: Suspicious trades (large gold amounts) flagged for review

**Incident Response Process**:
1. **Detection**: Automated alerts for critical errors, manual monitoring
2. **Assessment**: Determine scope and severity of incident
3. **Containment**: Disable affected features if necessary
4. **Investigation**: Review logs, identify root cause
5. **Remediation**: Apply fixes, update code
6. **Communication**: Notify affected users if data breach occurred
7. **Post-Mortem**: Document incident, update procedures

**Security Disclosure**:
- **Vulnerability Reporting**: Email barniecorps@gmail.com
- **Private Disclosure**: Do not publicly disclose before fix/mitigation
- **Response Time**: Acknowledge within 48 hours, fix within 30 days for critical issues
- **Recognition**: Responsible disclosure recognized (no bug bounty program currently)

### Physical & Operational Security

**Hosting Environment**:
- **Platform**: Details not disclosed for security
- **Access Control**: Limited to authorized operators
- **Environment Variables**: Sensitive configuration in environment, not code
- **Deployment**: Secure deployment process with limited access

**Personnel Security**:
- **Owner Access**: Limited to individuals in `OWNERS` environment variable
- **Staff Vetting**: Staff ranks granted carefully, audited regularly
- **Access Revocation**: Staff rank removed immediately upon departure
- **Principle of Least Privilege**: Staff only have access necessary for their role

**Operational Practices**:
- **Regular Updates**: Bot code and dependencies updated regularly
- **Security Patches**: Critical security updates applied promptly
- **Backup Testing**: Regular restore tests ensure backups functional
- **Disaster Recovery**: Documented procedures for catastrophic failures
- **Change Management**: Controlled deployment process, testing before production

### Limitations & User Responsibilities

**No System Is Perfect**:
- Despite best efforts, no security system is 100% foolproof
- Bot hosted by third parties (Discord infrastructure, database providers)
- Third-party services (Google, NVIDIA) have their own security measures
- User actions (weak passwords, sharing credentials) can compromise security

**User Responsibilities**:
- **Password Strength**: Choose strong, unique passwords for RPG accounts
- **Password Secrecy**: Never share your password with anyone
- **Email Security**: Secure your email address used for verification
- **Social Engineering**: Be wary of impersonators requesting sensitive information
- **Phishing**: Verify that bot messages are legitimate (check bot tag, avatar)
- **Public Channels**: Don't share sensitive information in public global chat

**Reporting Security Issues**:
- Email: barniecorps@gmail.com
- Subject: "Security Vulnerability - BarnieBot"
- Include: Detailed description, steps to reproduce, potential impact
- Do NOT: Publicly disclose before fix, exploit for personal gain

### Third-Party Security

**Discord Platform**:
- Bot relies on Discord's security infrastructure
- Discord API secured with bot token authentication
- Discord CDN hosts user avatars and message attachments
- Discord's own privacy policy and security measures apply

**Google Services**:
- Translate API: Text sent via HTTPS, Google's privacy policy applies
- Gmail SMTP: Email delivery via TLS, Google's privacy policy applies

**NVIDIA Services**:
- Riva ASR/TTS: Audio/text sent via gRPC with TLS, NVIDIA's privacy policy applies

See [Third-Party Services](#third-party-services) section for more details on external service usage.

**Important**: While we implement strong security measures, you use BarnieBot at your own risk. We are not liable for security breaches caused by factors outside our control, including but not limited to Discord platform vulnerabilities, third-party service breaches, or user negligence.

## Third-Party Services

BarnieBot integrates with several external services to provide its features. When you use features powered by these services, your data may be transmitted to and processed by these third parties. Each service has its own privacy policy and data handling practices.

### Discord Platform

**Service Provider**: Discord Inc.  
**Purpose**: Bot hosting platform, user authentication, message delivery, guild management  
**Data Shared**:
- User IDs, usernames, avatars (fetched from Discord API)
- Guild IDs, names, member counts
- Channel IDs, message content (for bot-enabled channels)
- Voice state data (for voice features)
- Interaction data (slash commands, buttons, select menus)

**Data Flow**:
- Bot receives events from Discord Gateway (WebSocket connection)
- Bot sends messages/embeds via Discord REST API
- All communications over HTTPS/WSS with TLS 1.2+
- Discord hosts user avatars and message attachments on their CDN

**Privacy Policy**: https://discord.com/privacy  
**Terms of Service**: https://discord.com/terms  
**Data Control**: Discord is the primary data controller for Discord accounts; we are a data processor

**Note**: BarnieBot cannot function without Discord. By using Discord, you are subject to Discord's data practices independently of BarnieBot.

### Google Translate (Translation Features)

**Service Provider**: Google LLC (via unofficial `google-translate-api-x` library)  
**Purpose**: Automatic translation of bot responses and global chat messages  
**Features Using This Service**:
- Global chat auto-translate feature
- `/setlang` command response translation
- `b.rules [lang]` command translation
- Bot response localization

**Data Shared**:
- Text content to be translated
- Source language code (if known)
- Target language code
- No user identifiers sent to translation API

**Data Flow**:
- Text sent via HTTPS to Google Translate API
- Translation returned immediately
- Cached for 10 minutes to reduce API calls
- No long-term storage on Google's side (as far as we know)

**Important**: We use an unofficial library (`google-translate-api-x`) that accesses Google Translate's web interface, not an official paid API. This means:
- Google's standard Privacy Policy applies
- Service may be less reliable than official API
- Google could change or restrict access at any time
- Your translated text is processed by Google's infrastructure

**Privacy Policy**: https://policies.google.com/privacy  
**Data Control**: We have no control over Google's translation data handling

**User Control**:
- Disable auto-translate for your guild via `/globalchat autotranslate`
- Opt out of translation by using English (default, not translated)
- Don't send sensitive information to global chat if concerned about translation

### NVIDIA Riva (Voice Features)

**Service Provider**: NVIDIA Corporation  
**Purpose**: Speech-to-text (ASR) and text-to-speech (TTS) for voice conversations  
**Features Using This Service**:
- `/ai voice` command (voice conversation in voice channels)

**Data Shared**:
- **ASR (Automatic Speech Recognition)**:
  - Audio data from your voice in voice channel
  - Audio format, sample rate, encoding
  - No user identifiers
- **TTS (Text-to-Speech)**:
  - Text to be converted to speech
  - Voice selection parameters
  - No user identifiers

**Data Flow**:
- Audio/text sent via gRPC with TLS encryption
- Processed in real-time
- Response returned immediately (transcription or audio)
- No storage of audio files

**Data Retention by NVIDIA**:
- NVIDIA's data handling practices for Riva API apply
- Audio not stored by BarnieBot (ephemeral processing only)
- We have no control over NVIDIA's data retention

**Privacy Policy**: https://www.nvidia.com/en-us/about-nvidia/privacy-policy/  
**Riva Documentation**: https://docs.nvidia.com/deeplearning/riva/

**User Control**:
- Don't use `/ai voice` if concerned about voice data processing
- Voice data processed in real-time, not stored by bot
- Leave voice channel to stop audio processing

### Gmail SMTP (Email Delivery)

**Service Provider**: Google LLC  
**Purpose**: Sending verification codes for RPG account registration  
**Features Using This Service**:
- `/register new` (email verification code)
- `/register resend` (resend verification code)

**Data Shared**:
- Recipient email address (your email)
- Email content (6-digit verification code)
- Sender email (bot's Gmail address)
- Email metadata (subject, timestamp)

**Data Flow**:
- Email composed on bot server
- Sent via Gmail SMTP with STARTTLS encryption
- Delivered to your email provider
- No long-term storage by BarnieBot (code stored temporarily in database)

**Gmail's Data Handling**:
- Gmail may scan emails for spam/security purposes
- Google's standard email privacy policies apply
- Emails may be retained in Gmail's "Sent" folder

**Privacy Policy**: https://policies.google.com/privacy  
**Gmail Privacy**: https://policies.google.com/privacy#infocollect

**User Control**:
- Provide a disposable/temporary email if concerned about privacy
- Delete verification email after use
- Email only used for verification, not marketing

### Meme API (Optional `/meme` Command)

**Service Provider**: Various (depends on meme API used)  
**Purpose**: Fetch random memes for `/meme` command  
**Features Using This Service**:
- `/meme` command only

**Data Shared**:
- API request (fetch random meme)
- No user identifiers or personal data

**Data Flow**:
- Simple GET request to public meme API
- Meme image URL returned
- Meme displayed in Discord embed
- No data sent except API request

**Privacy Impact**: Minimal (no personal data shared)

**User Control**:
- Don't use `/meme` command if concerned
- Meme images hosted by third-party services

### MySQL Database (Data Storage)

**Service Provider**: MySQL (self-hosted or database provider)  
**Purpose**: Persistent data storage for all bot features  
**Data Stored**: See [Information We Collect](#information-we-collect) section

**Security**:
- TLS encryption for connections
- Parameterized queries (SQL injection prevention)
- Encrypted fields for sensitive data (passwords, global messages)
- Access control via database credentials

**Hosting**: Hosting provider's privacy policy applies if using managed database service

**Backups**: Daily backups encrypted and stored securely

### Node.js & NPM Packages

**Dependencies**: BarnieBot uses numerous NPM packages (see `package.json`)  
**Purpose**: Core functionality (Discord.js, database drivers, utilities, etc.)  
**Data Handling**: Most packages process data locally on bot server, no external transmission  
**Security**: Regular dependency updates, vulnerability scanning

**Key Dependencies**:
- `discord.js`: Discord API wrapper (no external data transmission beyond Discord)
- `mysql`: Database driver (connects to MySQL server)
- `google-translate-api-x`: Translation (transmits text to Google)
- `axios`: HTTP client (used for API requests)
- `bcryptjs`: Password hashing (local processing only)
- `nodemailer`: Email sending (via Gmail SMTP)

**Data Control**: We have no control over how NPM packages or their maintainers handle data. We select reputable, well-maintained packages and review code when possible.

### External Links in Bot Responses

BarnieBot may provide links to external websites:
- GitHub repository (https://github.com/Barnie-Corps/barniebot)
- Privacy policy, security policy, usage policy
- Documentation and support resources
- Meme images (hosted externally)

**Clicking External Links**: When you click links provided by the bot, you leave Discord and BarnieBot's control. External websites have their own privacy policies and terms of service.

**User Responsibility**: Review privacy policies of external sites before providing personal information.

### Data Sharing Summary

| Service | Data Shared | Purpose | Control |
|---------|-------------|---------|---------|
| Discord | User IDs, messages, guild data | Core platform | Discord's privacy policy |
| Google Translate | Text content | Translation | Google's privacy policy |
| NVIDIA Riva | Audio/text | Voice conversations | NVIDIA's privacy policy |
| Gmail SMTP | Email, verification codes | Account verification | Google's privacy policy |
| Meme API | API requests | `/meme` command | API provider's policy |

**Important Notes**:
- We do **NOT** sell your data to third parties
- Third-party services accessed for feature functionality only
- We have no control over third-party data retention or usage
- Each service's privacy policy governs their data handling
- You can opt out of features that use services you don't trust

**Minimizing Third-Party Exposure**:
- Don't use AI features if concerned about data processing by AI providers
- Disable auto-translate in global chat
- Avoid `/meme` and `/ai voice` commands
- Use disposable email for RPG registration
- Review third-party privacy policies before using affected features

## Your Choices and Rights

You have several rights and choices regarding your personal data collected and processed by BarnieBot. We are committed to honoring these rights and providing you with control over your information.

### Right to Access
**What It Means**: You can request access to the personal data we hold about you.

**How to Exercise**:
1. Email barniecorps@gmail.com with your Discord ID
2. Verify your identity through Discord account or registered email
3. Specify what data you want to access

**What You Can Access**:
- Your RPG account data (username, email, character stats, inventory)
- Your global chat message history (decrypted export)
- Your moderation history (warnings, mutes, blacklists)
- Your command execution history
- Your AI memories
- Your language preferences
- Your VIP subscription status
- Staff notes about you (redacted if necessary)

**Response Time**: Within 30 days of verified request

**Format**: JSON, CSV, or TXT depending on data type

### Right to Rectification
**What It Means**: You can request correction of inaccurate or incomplete data.

**Examples**:
- Correct your RPG account email address
- Update your language preference
- Fix character name typos (within reason)

**How to Exercise**:
- Some data: Use bot commands (`/setlang` for language, `/register info` to view account data)
- Other data: Email barniecorps@gmail.com with specific corrections needed

**Limitations**: 
- Cannot change Discord username (controlled by Discord, not us)
- Cannot alter moderation records (integrity required for enforcement)
- Cannot change past timestamps or historical data

**Response Time**: Immediate for self-service commands, within 30 days for manual requests

### Right to Erasure (Right to be Forgotten)
**What It Means**: You can request deletion of your personal data.

**Full Account Deletion**:
- Email barniecorps@gmail.com with "Account Deletion Request"
- Verify ownership through account credentials or email
- All RPG data deleted: character, inventory, quests, equipment, trade history
- Timeframe: Processed within 30 days

**Partial Data Deletion**:
- Language preference: Reset to default (English)
- AI memories: Delete via AI commands (immediate)
- VIP subscription: Contact for early termination
- Custom responses: Guild admins can delete anytime

**What Cannot Be Deleted**:
- **Moderation history** (warnings, blacklists, mutes): Required for abuse prevention, repeat offense tracking, and appeal history
- **Global chat encrypted logs**: Required for ongoing and future investigations, pattern analysis, network security
- **Staff audit log**: Required for compliance, accountability, cannot be tampered with
- **Support ticket transcripts**: Required for quality assurance, dispute resolution, training
- **Staff notes**: May be redacted but not deleted (case management)

**Anonymization Option**: For moderation data, we can anonymize your Discord ID while preserving the records for statistical and enforcement purposes.

**Important**: Deletion is permanent and irreversible. All progress, items, and character data will be lost for RPG accounts.

### Right to Restriction of Processing
**What It Means**: You can request that we limit how we use your data.

**How to Exercise**:
- Request that we stop specific types of processing
- Example: "Don't translate my global chat messages" (disable auto-translate for your guild)
- Example: "Don't use my data for analytics" (we only do aggregate analytics, not individual tracking)

**Limitations**: 
- Core functionality requires some data processing
- Cannot restrict processing required for safety/moderation
- Cannot restrict processing required by law

**Available Restrictions**:
- Opt out of auto-translate (guild setting)
- Opt out of AI features (simply don't use them)
- Opt out of RPG system (don't create account)
- Opt out of global chat (leave channels or have guild admin disable)

### Right to Data Portability
**What It Means**: You can receive your data in a structured, machine-readable format and transmit it to another service.

**Data You Can Export**:
- RPG account data (JSON format with all character info, inventory, stats)
- Global chat messages (TXT format, decrypted)
- Command history (CSV format)
- Warning history (CSV format)
- AI memories (JSON format)

**How to Exercise**:
1. Email barniecorps@gmail.com with "Data Export Request"
2. Verify identity
3. Specify desired data categories
4. Receive export within 30 days

**Format**: JSON (structured data), CSV (tabular data), or TXT (message logs)

**Use Cases**: Backup your data, transfer to another bot (if compatible), personal archiving

### Right to Object
**What It Means**: You can object to certain types of data processing.

**Objection Grounds**:
- Processing based on legitimate interests (not contractual necessity)
- Direct marketing (we don't do marketing, so not applicable)
- Automated decision-making (we don't do automated profiling)

**How to Exercise**: Email barniecorps@gmail.com with specific objection

**Limitations**: Cannot object to processing required for:
- Core bot functionality
- Safety and moderation enforcement
- Legal compliance
- Contract fulfillment (features you've opted into)

### Right to Withdraw Consent
**What It Means**: For processing based on consent, you can withdraw it anytime.

**Consent-Based Features**:
- VIP subscriptions (contact to cancel)
- RPG account creation (delete account to withdraw consent)
- Email verification (unverify account or delete)

**How to Exercise**: 
- Stop using feature
- Delete account
- Contact barniecorps@gmail.com

**Effect**: Processing stops immediately, but lawfully processed data before withdrawal may be retained as necessary

### Right to Lodge a Complaint
**What It Means**: If you believe we've violated data protection laws, you can complain to a supervisory authority.

**Contact Us First**: Please contact barniecorps@gmail.com with concerns before escalating

**Supervisory Authority**: If you're in the EU, you can contact your local data protection authority. We will cooperate with investigations.

**Discord Trust & Safety**: For Discord platform issues, contact Discord's Trust & Safety team

### User Control Features

**Language Preferences**:
- Command: `/setlang <language>`
- Effect: Changes language for bot responses
- Control: You can change anytime
- Reset: Contact to remove preference

**Global Chat Participation**:
- Control: Leave global chat channels or have admin disable in guild
- Effect: Your messages won't be relayed; you won't see others' messages
- Data: Past messages remain encrypted in database

**AI Features**:
- Control: Simply don't use `/ai` commands
- Memories: Add/delete via AI commands
- Sessions: Ephemeral, cleared on end/restart

**RPG Account**:
- Password Change: Use in-game command (if implemented) or contact admin
- Session Control: Logout via in-game command
- Account Deletion: Request via email with verification

**Content Filter (Guild Admins)**:
- Control: Configure via `/filter` commands
- Enable/disable: Toggle filtering per guild
- Word list: Add/remove filtered words
- Logs: Enable/disable filter logging

**Custom Responses (Guild Admins)**:
- Control: Manage via `/custom_responses` commands
- Add/remove: Full control over custom commands
- Effect: Only affects your guild

**Support Tickets**:
- Close: Click "Close Ticket" button or ask staff
- Data: Transcript preserved after closure
- Deletion: Channel can be deleted post-closure (transcript remains)

### Children's Privacy Controls
If you are a parent/guardian:
- Review what data is collected (see Information We Collect section)
- Request data deletion for accounts created by children under 13
- Contact barniecorps@gmail.com with concerns

### Automated Decision-Making
**Status**: BarnieBot does NOT engage in automated decision-making with legal or similarly significant effects.

**What We Don't Do**:
- No automated profiling for targeted content
- No credit scoring or financial decisions
- No automated employment decisions
- No automated legal decisions

**What We Do Automate**:
- Rate limiting (technical necessity, not profiling)
- Auto-assignment of support tickets (workload balancing, not discrimination)
- Auto-expiration of timed mutes (enforcement of set duration)
- Content filtering (based on guild-defined rules)

**Human Review**: All significant moderation actions (warnings, blacklists, account bans) involve human staff decision-making.

### Contact for Rights Requests
**Email**: barniecorps@gmail.com  
**Subject Line**: "Data Rights Request - [Type of Request]"  
**Required Information**:
- Your Discord ID
- Your Discord username
- Email associated with RPG account (if applicable)
- Specific request (access, deletion, correction, export, etc.)
- Verification method preference (Discord account or email)

**Response Time**: We aim to respond within 7 days and fulfill requests within 30 days.

**Verification**: We may ask for additional verification to protect your account security.

**Exceptions**: We will notify you if we cannot fulfill a request and explain why (e.g., legal obligation to retain data).

### Complaints and Concerns
If you have privacy concerns:
1. **Contact us first**: barniecorps@gmail.com - we're committed to resolving issues
2. **Discord Trust & Safety**: For platform-level concerns
3. **Local Authorities**: Contact your data protection authority if EU-based
4. **Legal Action**: You have the right to pursue legal remedies if you believe your rights have been violated

We value your privacy and will work with you to address concerns promptly and fairly.

## Children's Privacy

BarnieBot is a general-audience Discord bot that can be used by individuals of all ages. However, we recognize special privacy considerations for children under 13 years old (or the applicable age of digital consent in their jurisdiction).

### Age Restrictions
**Discord's Policy**: Discord requires users to be at least 13 years old (or older in some jurisdictions) per their Terms of Service. By using Discord, users attest to meeting this age requirement.

**Our Position**: BarnieBot does not independently verify ages. We rely on Discord's age verification and parental controls.

**COPPA Compliance (United States)**: If you are under 13 and in the United States, you should not use BarnieBot without verifiable parental consent, in accordance with the Children's Online Privacy Protection Act (COPPA).

### Data Collection from Children
We do not knowingly collect personal information from children under 13 without parental consent. If we learn that we have collected data from a child under 13, we will take steps to delete it promptly.

**Data Types That May Be Collected**:
- Discord User ID, username, avatar (same as adult users)
- Global chat messages (if participating in global chat)
- Command execution records
- RPG account data (if registered)
- Language preferences

**No Enhanced Data Collection**: Children using the bot are subject to the same data collection practices as adults. We do not collect additional data from children.

### Parental Rights
If you are a parent or guardian and believe your child has provided personal information to BarnieBot:

**Right to Review**: Request to review what data has been collected from your child  
**Right to Delete**: Request deletion of your child's data  
**Right to Refuse Further Collection**: Request that we stop collecting data from your child  

**How to Exercise Parental Rights**:
1. Email barniecorps@gmail.com with subject "Parental Rights Request"
2. Provide:
   - Your child's Discord ID and username
   - Your relationship to the child (parent/guardian)
   - Specific request (review, delete, stop collection)
   - Verification of parental authority (may require documentation)
3. We will respond within 7 days and fulfill request within 30 days

**Verification**: To protect children's privacy, we may require verification of parental authority before processing requests. This may include:
- Government-issued ID confirming relationship
- Email from parent's address matching child's RPG account
- Discord account verification showing parental control

### Educational Use
**School/Educational Settings**: If BarnieBot is used in an educational setting (e.g., school Discord servers), the school/institution is responsible for obtaining necessary parental consents under COPPA, FERPA, and other applicable education privacy laws.

**Teacher/Administrator Responsibilities**:
- Obtain parental consents as required by law
- Ensure compliance with school privacy policies
- Monitor student use of bot features
- Request data deletion for students who leave or withdraw consent

**Our Role**: We are a service provider in educational contexts and will cooperate with schools to ensure compliance.

### Appropriate Content
**Content Moderation**: BarnieBot's global chat and moderation systems help maintain appropriate content, but we cannot guarantee all content is child-appropriate.

**Parental Responsibility**: Parents should:
- Monitor their children's Discord usage
- Review server rules and moderation policies
- Enable Discord's safety features (restricted mode, privacy settings)
- Teach children about online safety and privacy

**Age-Inappropriate Content**: If you find age-inappropriate content in BarnieBot's global chat or other features, report it to barniecorps@gmail.com or use Discord's reporting features.

### Features of Special Concern for Children

**AI Chat Features**:
- Children may inadvertently share personal information with AI
- AI responses not specifically tailored for children
- Parents should monitor or restrict use of `/ai` commands

**RPG System**:
- Requires email address for verification (child or parent's email)
- Trading features may expose children to in-game scams
- Parents should supervise account creation and gameplay

**Global Chat**:
- Cross-server communication with strangers
- Auto-translation may reduce effectiveness of content filters
- Parents should review global chat rules and monitor participation

**Voice Features**:
- `/ai voice` processes voice data through NVIDIA Riva
- Parents should supervise voice channel participation
- Voice data processed in real-time (not stored)

### International Considerations
**Age of Digital Consent**: Varies by jurisdiction:
- United States: 13 (COPPA)
- European Union: 13-16 depending on member state (GDPR)
- Other countries: May have different requirements

**Compliance**: We attempt to comply with applicable laws globally. If you believe we are not in compliance in your jurisdiction, contact barniecorps@gmail.com.

### Contact for Children's Privacy Concerns
**Email**: barniecorps@gmail.com  
**Subject**: "Children's Privacy Concern"  
**Response Time**: Within 48 hours for children's privacy issues

We take children's privacy seriously and will work promptly to address any concerns.

## Policy Updates

This Privacy Policy may be updated from time to time to reflect changes in our practices, features, legal requirements, or for other operational, legal, or regulatory reasons.

### When We Update
We may update this policy when:
- New features are added that collect or process data differently
- New third-party services are integrated
- Data retention policies change
- Legal or regulatory requirements change
- Security practices are enhanced
- User feedback prompts policy clarification
- Operational changes affect data handling

### How We Notify You
**Material Changes**: For significant changes that materially affect your privacy rights or data handling:
1. **Global Chat Announcement**: Announcement posted to all connected guilds via global chat system
2. **Discord Server**: Posted in official BarnieBot support/community server
3. **GitHub Repository**: Policy file updated with clear change summary and date
4. **Email**: If we have your email (RPG account holders), we may send notification

**Minor Changes**: For clarifications, typos, or non-material updates:
- GitHub repository updated with new "Last Updated" date
- No proactive notification required

### What Constitutes a Material Change
**Material changes include**:
- New data collection practices
- Changes in data sharing with third parties
- Changes in data retention periods (especially longer retention)
- Changes in security practices that reduce protection
- Changes in user rights or how to exercise them
- Changes in purposes for data use beyond original scope

**Non-material changes include**:
- Typo corrections and grammatical improvements
- Clarifications that don't change substance
- Contact information updates
- Formatting or organization improvements
- Examples added for clarity
- Links updated (same destination, new URL)

### Effective Date
The "Last Updated" date at the top of this policy indicates when the current version became effective.

**Current Version Effective**: February 6, 2026

**Previous Versions**: We do not maintain a public archive of previous policy versions. Contact barniecorps@gmail.com if you need a previous version for legal or compliance purposes.

### Your Acceptance
**Continued Use = Acceptance**: By continuing to use BarnieBot after a policy update becomes effective, you accept the updated terms.

**Objection Process**: If you do not agree with updated policy:
1. Discontinue use of BarnieBot immediately
2. Request data deletion (see Your Choices and Rights section)
3. Contact barniecorps@gmail.com with specific concerns

**Grace Period**: For material changes, we may provide a 30-day grace period before enforcement, announced with the change.

### Version History Summary
- **February 6, 2026**: Minor change, removal of Google's Gemini references.
- **November 26, 2025**: Major expansion with comprehensive detail on all data practices, security measures, user rights, and third-party services
- **November 19, 2025**: Previous version with core privacy information

### Notification Preferences
Currently, we do not offer opt-in/opt-out for policy update notifications. All users receive announcements via global chat for material changes.

**Future Enhancement**: We may add email notification preferences for RPG account holders.

### Questions About Updates
If you have questions about a policy update:
- Email barniecorps@gmail.com with subject "Privacy Policy Update Question"
- Ask in official BarnieBot support server
- Reference specific section or change you're inquiring about

We will provide clarification promptly.

## Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or BarnieBot's data practices, please contact us:

### Primary Contact
**Email**: barniecorps@gmail.com  
**Subject Line Guidance**:
- "Privacy Question" - General privacy inquiries
- "Data Rights Request" - Access, deletion, correction, export requests
- "Security Concern" - Security vulnerabilities or incidents
- "Children's Privacy" - Child-related privacy concerns
- "Policy Update Question" - Questions about policy changes
- "Complaint" - Privacy complaints or concerns

**Response Time**: 
- Acknowledgment within 48 hours
- Full response within 7 business days
- Rights requests processed within 30 days

### Discord Contact
**Direct Message**: r3tr00_ (Discord handle)  
**Note**: For sensitive issues, email is preferred over Discord DMs for privacy and record-keeping.

### Support Server
**GitHub Issues**: https://github.com/Barnie-Corps/barniebot/issues  
**For**: Bug reports, feature requests, public discussions  
**Not For**: Private data requests or sensitive security issues

### Business Inquiries
For partnership, collaboration, or business inquiries related to BarnieBot:
- Email barniecorps@gmail.com with subject "Business Inquiry"

### Legal Requests
For legal requests, law enforcement inquiries, or subpoenas:
- Email barniecorps@gmail.com with subject "Legal Request"
- Include case number, jurisdiction, and legal basis
- We will respond in accordance with applicable laws

### Security Vulnerability Reports
**Email**: barniecorps@gmail.com  
**Subject**: "Security Vulnerability - BarnieBot"  
**Do NOT**: Publicly disclose before we've had opportunity to fix  
**Do Include**:
- Detailed description of vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code (if applicable)

**Response Process**:
1. Acknowledgment within 48 hours
2. Assessment and severity determination
3. Fix development and testing
4. Patch deployment
5. Disclosure coordination (if applicable)
6. Recognition (if desired)

### Data Protection Officer
**Status**: BarnieCorps does not currently have a designated Data Protection Officer.  
**Contact**: All data protection inquiries should be directed to barniecorps@gmail.com.

### Mailing Address
**Status**: No physical mailing address currently provided for privacy and security reasons.  
**Digital Contact**: All communications via email or Discord as listed above.

### Language
This Privacy Policy is written in English. If we provide translations, the English version controls in case of conflicts.

### Jurisdiction
**BarnieCorps Location**: Details not disclosed for security/privacy reasons  
**Applicable Law**: Contact for specific legal jurisdiction questions

### Acknowledgment
By using BarnieBot, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy. If you do not agree, please discontinue use immediately.

---

**Thank you for trusting BarnieBot with your data. We are committed to protecting your privacy and being transparent about our data practices.**

**Last Updated**: February 6, 2026
**Version**: 2.0

© 2026 BarnieCorps. All rights reserved.

