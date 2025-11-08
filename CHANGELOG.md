# BarnieBot Change Log

Version numbering has been retired. This log now records notable functional shifts and feature additions chronologically (top = latest).

## Recent
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