# BarnieBot

A powerful TypeScript Discord bot that bridges communities through global chat, AI assistance, comprehensive moderation tools, a fully-featured RPG system with account management, and a fully managed support ticket workflow.

## What It Does

**Global Chat Network** – Connect multiple Discord servers with encrypted cross-guild messaging, automatic translation (20+ languages), staff rank suffixes, anti-impersonation protection, and global custom commands (`b.rules`, `b.help`).

**AI Powered** – Google Gemini and NVIDIA AI models integration for conversational chat (`/ai chat`), quick and reasoning questions (`/ai ask`), and voice conversations with speech-to-text.

**RPG System** – Complete character progression with account registration, 5 unique classes (Warrior, Mage, Rogue, Paladin, Archer), stat management, equipment system (7 slots), inventory management, shop with database-driven items, player-to-player trading, turn-based combat with difficulty scaling, quest system, and leaderboards. Includes single-session login enforcement, account status management (freeze/ban), and comprehensive admin tools.

**Staff & Moderation System** – Eight-tier staff hierarchy (Support → Owner) with global enforcement tools: blacklists, warnings, mutes, ticket assignment & auditing. Interactive pagination for case history (`/staff cases`). Includes appeal system for warnings with staff review workflow and comprehensive audit logging.

**Support Tickets** – Users open tickets via `/support` (DM or guild); system creates a home-guild channel, relays messages bi‑directionally (user ↔ staff), auto-assigns available staff (fair workload), tracks first response time, exports TXT+HTML transcripts, and supports priority/category, internal staff notes, audit logging, and controlled closure.

**Guild Customization** – Per-server content filters with protected words, custom command responses (regex or literal), language preferences, and webhook-based dispatch.

## Core Features
- **Global Chat**: Encrypted messages, per-guild language settings, optional auto-translate, staff suffix display, global custom commands (`b.rules [lang]`, `b.help`)
- **RPG System**: 
  - Account Management: Email verification, encrypted passwords (AES-256-CBC), single-session enforcement
  - Character System: 5 classes with unique base stats, level progression (1-100+), stat point allocation, HP/MP management
  - Equipment: 7 slots (weapon, helmet, armor, gloves, boots, 2 accessories), stat bonuses, level/class requirements
  - Inventory: Stackable/non-stackable items, rarity tiers (common→mythic), binding system, quantity limits
  - Shop: Database-driven items (potions, weapons, armor, accessories), buy/sell with gold, dynamic pricing
  - Trading: Player-to-player trades with gold/items, offer/accept/decline flow, tradeable/bound validation
  - Combat: Turn-based battles with 4 difficulty tiers, critical hits, experience/gold rewards, combat logs
  - Admin Tools: Freeze/ban accounts, modify stats, change passwords, force logout, give/remove items, detailed account info
- **Moderation**: Interactive warning viewer with appeal system, global blacklists, timed/indefinite mutes, action audit trail with staff attribution
- **Support Tickets**: `/support` creation, auto-assignment by workload, priority & category, first response time tracking, HTML/TXT transcripts, user close button, confirmation dialogs, channel delete flow, internal staff notes
- **Staff Tools**: `/stafftools tickets|assign|priority|category|status|note|notes|search|auditlog|reviewappeals|notify|rpg_*` for comprehensive management
- **AI Functions**: Session-based chat, function calling for server info/user lookup/guild management, VIP-gated features, persistent user memories
- **Content Filter**: Word-based filtering, single-word vs substring matching, protected words, log webhooks
- **Custom Responses**: Guild-specific commands with regex support
- **Worker Pools**: Translation and rate-limit processing off the main loop (dynamic sizing, prewarm, keep-alive)
- **VIP System**: Time-based subscriptions for extended AI access
- **Process Manager**: Optional resilient runner (`npm run start:managed`) with crash pattern detection, auto-restart, reboot flag & completion announcement

## Tech Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Discord**: Discord.js v14 (Gateway + Interactions)
- **Database**: MySQL 5.7+ with auto-migration
- **AI**: Google Gemini API (chat + safety checks), NVIDIA models for reasoning
- **Workers**: Node.js worker threads for translation and rate limiting
- **Security**: AES-256-CBC encryption, parameterized queries, staff impersonation stripping
- **Mail**: Gmail SMTP for notifications

## Quick Start
```bash
git clone https://github.com/Barnie-Corps/barniebot.git
cd barniebot
npm install
cp .env.example .env  # Configure secrets below
# Development (no auto-restart)
npm run start
# Production (with Process Manager auto-restart & reboot tracking)
npm run start:managed
```

### Environment Configuration
**Required:**
```
TOKEN=your-discord-bot-token
DISCORD_BOT_ID=your-app-id
OWNERS=owner1-id,owner2-id
DB_HOST=localhost
DB_USER=barniebot
DB_PASSWORD=your-db-password
DB_NAME=barniebot
ENCRYPTION_KEY=base64-encoded-32-bytes
AI_API_KEY=google-gemini-key
EMAIL_PASSWORD=gmail-app-password
```

**Optional:**
```
TRANSLATE_WORKERS=10               # Translation pool size (default: CPU count)
NOTIFY_STARTUP=1                   # Notify on unclean shutdown
SAFELY_SHUTTED_DOWN=1              # Set by b.shutdown
REBOOTING=0                        # Managed automatically for reboot completion announcement
TEST=0                             # Owner-only mode if 1
IGNORE_GLOBAL_CHAT=0               # Skip global chat processing
SEARCH_ENGINE_API_KEY=             # Google custom search (AI function)
SEARCH_ENGINE_CX=                  # Custom search engine ID
```

**Notes:**
- `ENCRYPTION_KEY`: Generate with `openssl rand -base64 32`
- `OWNERS`: Comma-separated Discord IDs for `b.` prefix commands
- `EMAIL_PASSWORD`: Gmail app-specific password (not account password)

## Commands

### Global Chat Prefix Commands (Public)
These are lightweight, globally broadcast informational commands executed in a configured global chat channel:

| Command | Args | Description |
|---------|------|-------------|
| `b.rules` | `[lang]` | Show global chat rules (languages: en, es, fr, de, pt) |
| `b.help` | none | Show available global commands & usage |

`b.rules es` → sends Spanish rules to all connected guilds via the global relay.

### Slash Commands (Everyone)
| Command | Description |
|---------|-------------|
| `/ai ask` | Single AI question (task-specific models) |
| `/ai chat` | Start contextual AI session (VIP only) |
| `/ai voice` | Voice conversation in VC (VIP only) |
| `/register new` | Create new RPG account with email verification |
| `/register verify` | Verify account with 6-digit code |
| `/register resend` | Resend verification code (1min cooldown) |
| `/register info` | View account information and character |
| `/login` | Login to RPG account (single-session enforcement) |
| `/rpg create` | Create character (name, class selection) |
| `/rpg profile` | View character profile with stats & equipment |
| `/rpg stats` | View/allocate stat points (STR, DEF, AGI, INT, LUK) |
| `/rpg inventory` | Browse inventory with pagination & rarity sorting |
| `/rpg equip` | Equip items with requirement validation |
| `/rpg unequip` | Unequip items from specific slots |
| `/rpg rest` | Restore HP/MP (5min cooldown) |
| `/rpg battle` | Combat with monsters (4 difficulties) |
| `/rpg leaderboard` | Top players by level/gold/experience |
| `/shop browse` | Browse shop by category (potions, weapons, armor, accessories) |
| `/shop buy` | Purchase items with gold |
| `/shop sell` | Sell inventory items (50% value) |
| `/trade offer` | Initiate trade with player (gold/items) |
| `/trade accept` | Accept trade with counter-offer |
| `/trade view` | View pending trades (sent/received) |
| `/trade decline` | Decline trade offer |
| `/trade cancel` | Cancel your pending trade |
| `/support` | Create support ticket (auto-assigns staff) |
| `/globalchat set` | Configure global chat channel (Manage Channels) |
| `/globalchat toggle` | Enable/disable global chat (Manage Channels) |
| `/globalchat autotranslate` | Toggle auto-translation (Manage Channels) |
| `/globalchat language` | Set guild language (Manage Channels) |
| `/setlang` | Set personal language preference |
| `/filter setup` | Initialize filter wizard (Manage Messages) |
| `/filter add` | Add filtered word (Manage Messages) |
| `/filter remove` | Remove word by ID (Manage Messages) |
| `/filter view` | List all filtered words (Manage Messages) |
| `/filter search` | Search filter by query (Manage Messages) |
| `/filter toggle` | Enable/disable filter (Manage Messages) |
| `/custom_responses add` | Add custom command (Manage Guild) |
| `/custom_responses remove` | Remove custom command (Manage Guild) |
| `/custom_responses list` | List custom commands (Manage Guild) |
| `/ping` | Check bot latency |
| `/botinfo` | System stats and info |
| `/userinfo` | User profile and stats |
| `/github` | Repository link |
| `/privacy` | Privacy policy link |
| `/avatar` | Get user avatar |
| `/meme` | Random meme |
| `/top` | Server leaderboard |

### Staff Commands
| Command | Required Rank | Description |
|---------|---------------|-------------|
| `/staff set` | Chief of Moderation+ | Assign/remove staff ranks |
| `/staff info` | Anyone | View user's rank |
| `/staff list` | Anyone | List all staff |
| `/staff cases` | Anyone | View moderation history (interactive pagination) |
| `/globalmod blacklist` | Chief of Moderation+ | Ban from global chat |
| `/globalmod unblacklist` | Chief of Moderation+ | Unban from global chat |
| `/globalmod warn` | Chief of Moderation+ | Issue warning |
| `/globalmod mute` | Chief of Moderation+ | Mute in global chat (timed/indefinite) |
| `/globalmod unmute` | Chief of Moderation+ | Remove mute |
| `/globalmod status` | Chief of Moderation+ | Check user status |
| `/workers` | Anyone | Worker pool health stats |

### Owner Commands (prefix: `b.`)
**Access:** Restricted to Discord IDs in `OWNERS` environment variable.

| Command | Arguments | Description |
|---------|-----------|-------------|
| `b.shutdown` | none | Gracefully stop bot |
| `b.reboot` | none | Restart bot (ProcessManager required for auto-return) |
| `b.status` | none | Show runtime stats (uptime, memory, guilds, users) |
| `b.announce` | `<lang> <message>` | Broadcast to global chat |
### Support Ticket Commands
| Command | Description |
|---------|-------------|
| `/support` | Create a support ticket (DM recommended) |
| `/globalmod closeticket` | Close a ticket (with transcript export) |

### Staff Ticket Management (`/stafftools`)
| Subcommand | Description |
|------------|-------------|
| `tickets [filter]` | View open tickets (all/unassigned/mine/high) |
| `assign <ticket_id> [staff]` | Assign ticket to self or specified staff |
| `priority <ticket_id> <level>` | Set priority (low/medium/high/urgent) |
| `category <ticket_id> <type>` | Set category (general/technical/billing/report/appeal) |
| `status <state> [message]` | Set personal availability (available/busy/away/offline) |
| `note <user> <content>` | Add internal note about a user |
| `notes <user>` | View stored notes about a user |
| `search <query>` | Search open tickets (content/user) |
| `auditlog [staff] [action] [days]` | View filtered staff action audit log |

### Ticket Lifecycle Essentials
- User runs `/support` → channel auto-created in home guild category
- Auto-assignment picks least-loaded available staff (fair distribution)
- Messages relayed: user → `\`username\``: content | staff → `[RANK] name: content`
- First staff reply logs response time + announces metric in ticket channel
- Closing requires confirmation; generates TXT & HTML transcripts, logs audit
- Optional channel deletion via confirmed button flow
- Priority/category mutable mid-flight for SLA & routing
- Internal notes & audit trail improve accountability
| `b.messages` | `<user-id>` | Export user's global messages (decrypted) |
| `b.guilds` | none | Export guild list (name, member count, ID) |
| `b.eval` | `<code>` | Execute JavaScript (use with extreme caution) |
| `b.add_vip` | `<user-id> <time> <unit>` | Grant VIP (`unit`: days, hours, weeks, months) |
| `b.remove_vip` | `<user-id>` | Revoke VIP |
| `b.invite` | `<guild-id>` | Generate invite for specified guild |
| `b.fetch_guilds_members` | none | Cache all guild members |

**Security Warning:** `b.eval` runs arbitrary code in the bot's process. Owner verification is enforced, but exercise extreme caution.

## Staff Hierarchy
From lowest to highest authority:
1. **Support** – Basic assistance (suffix: SUPPORT)
2. **Moderator** – Standard moderation (MOD)
3. **Senior Moderator** – Experienced moderation (SR MOD)
4. **Chief of Moderation** – Moderation team lead (CoM)
5. **Probationary Administrator** – Trial admin (pADMIN)
6. **Administrator** – Full admin (ADMIN)
7. **Chief of Staff** – Staff leadership (CoS)
8. **Owner** – Bot operators (OWNER)

**Permissions:**
- Chief of Moderation+ can manage lower ranks and use moderation commands
- Staff cannot modify peers or superiors
- Owner status derived from `.env` automatically syncs to database

## Security & Privacy
**Encryption:** Global messages use AES-256-CBC before MySQL storage.

**Moderation Records:** Warnings permanent, mutes auto-expire, blacklists toggleable via `active` flag.

**Impersonation Protection:** Non-staff names automatically stripped of fake bracketed tags like `[MOD]`.

**Data Retention:** See `privacy.md` for full details. Global chat logs indefinite (abuse tracing), AI sessions ephemeral.

**Audit Trail:** All moderation actions record author ID and timestamp.
**Staff Action Logging:** Ticket operations (assign/priority/category/status/close), moderation (warn/mute/blacklist), notes & searches captured in `staff_audit_log` with metadata JSON.

Full details in `SECURITY.md` and `privacy.md`.

## Worker Architecture
**Translation Pool:** Dynamic sizing (env `TRANSLATE_WORKERS` or CPU count), prewarmed at startup, jittered keep-alive (750-1250ms), moving average latency tracking.

**Rate Limit Worker:** Single prewarmed instance offloads user cache and timer decrement loops, fallback to inline processing on failure.

**Benefits:** Prevents cold-start lag, keeps Discord event loop responsive during burst traffic.

## Development
See `CONTRIBUTING.md` for setup, coding standards, and PR guidelines.

**Prerequisites:**
- Node.js 18+
- MySQL 5.7+
- TypeScript 5+

**Build:**
```bash
npm run build  # Compiles TypeScript
npm start      # Run (no auto-restart)
npm run start:managed  # Run with Process Manager (recommended production)
```

**Test Mode:**
```bash
# Set TEST=1 in .env to restrict all features to owners only
```

## Links
- **GitHub:** https://github.com/Barnie-Corps/barniebot
- **Privacy Policy:** [privacy.md](./privacy.md)
- **Security Policy:** [SECURITY.md](./SECURITY.md)
- **Usage Policy:** [usage_policy.md](./usage_policy.md)
- **Special contributors:** [SPECIAL_CONTRIBUTORS.md](./SPECIAL_CONTRIBUTORS.md)

## Contact
- **Email:** barniecorps@gmail.com
- **Discord:** r3tr00_
- **Issues:** https://github.com/Barnie-Corps/barniebot/issues

---
Made with ❤️ by BarnieCorps.
