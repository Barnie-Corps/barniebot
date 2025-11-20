# BarnieBot Change Log

Version numbering has been retired. This log now records notable functional shifts and feature additions chronologically (top = latest).

## Recent
- **RPG System (Complete)**:
  - Account registration with email verification, encrypted passwords (AES-256-CBC), and single-session enforcement
  - Character creation with 5 unique classes (Warrior, Mage, Rogue, Paladin, Archer) and class-specific base stats
  - Comprehensive stat system (HP, MP, STR, DEF, AGI, INT, LUK) with level-up point allocation
  - 7-slot equipment system (weapon, helmet, armor, gloves, boots, 2 accessories) with stat bonuses and requirements
  - Inventory management with stackable/non-stackable items, rarity tiers (common→mythic), pagination
  - Database-driven shop system with 4 categories (potions, weapons, armor, accessories), buy/sell functionality
  - Player-to-player trading system with gold/item offers, accept/decline/cancel flows, tradeable/bound validation
  - Turn-based combat with 4 difficulty tiers, critical hits, experience/gold rewards, level progression
  - Rest system with 5-minute cooldown for HP/MP restoration
  - Leaderboards by level, gold, and experience
  - Admin moderation tools: freeze/ban accounts, modify stats, change passwords, force logout, give/remove items, detailed account info
  - 16 database tables for complete RPG architecture
- **Enhanced Registration Command**:
  - Rich embed design for all responses
  - Input validation (email format, username alphanumeric, 6-digit codes, 8+ char passwords with complexity)
  - Resend verification code subcommand with 1-minute cooldown
  - Account info subcommand showing creation date, last login, character status
  - Password strength requirements and secure deletion after setup
  - Extended 2-minute timeout for password setup
  - Better error handling with DM permission checks and duplicate account hints
- **Support Ticket System**:
  - Complete lifecycle management with auto-assignment by staff workload
  - Priority levels (low, medium, high, urgent) and categories (general, technical, billing, report, appeal)
  - First response time tracking and staff status management
  - Internal staff notes system for case management
  - HTML and TXT transcript export on closure
  - Message relay between user DMs and staff channel
  - Attachment handling with metadata storage
- **Staff Moderation Enhancements**:
  - Warning appeal system with staff review workflow (approve/deny)
  - Comprehensive audit log for all staff actions with filtering and search
  - Staff status system (available, busy, away, offline) with custom messages
  - Global notification system for admin announcements
  - 11 RPG-specific moderation commands in stafftools
  - Ticket search by content or user ID
- Staff rank system (Support → Owner) with automatic global chat suffixes.
- Impersonation protection (strip spoofed bracketed staff tags from non-staff names).
- `/staff cases` interactive pagination for moderation history (warnings, blacklist status, mute status).
- Global moderation commands: blacklist, unblacklist, warn, mute, unmute (`/globalmod`).
- Worker latency metrics + prewarm to reduce cold-start delays.
- Offloaded rate-limit decrement processing to worker threads.
- Dynamic translation worker pool sizing via `TRANSLATE_WORKERS` env.
- Encryption of global messages (AES-256-CBC) maintained.

## Earlier Highlights
- Global chat bridging with auto translation.
- AI function-calling and contextual chat sessions.
- Filter guided setup flow with interactive buttons.
- VIP gating for select AI features.
- Custom response system (regex + literal commands).

---
Historical versioned entries (pre-retirement) are archived separately if needed.