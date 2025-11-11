# BarnieBot Usage Policy

Last Updated: November 8, 2025

## 1) Overview
BarnieBot provides cross-guild global chat, AI features, and moderation tooling. By inviting or interacting with the bot you agree to this policy and Discord’s Terms of Service.

## 2) Acceptable Use
- Use the bot in communities you administer or have permission to configure.
- Keep prompts and shared content lawful, safe, and respectful.
- Disclose moderator actions transparently within your community where applicable.

## 3) Staff & Owner Controls
- **Owners**: Discord IDs in the `OWNERS` environment variable can execute prefix commands (`b.shutdown`, `b.announce`, `b.eval`, `b.messages`, etc.). These are administrative tools for bot operators only.
- **Staff Ranks** (Support → Owner): Manage global moderation via `/staff` and `/globalmod` commands. Chief of Moderation+ required for enforcement actions.
- **Anti-Impersonation**: Do not fake staff suffixes like `[MOD]` or `[ADMIN]` in your username; they will be automatically stripped in global chat.

## 4) Prohibited Activities
- Harassment, hate speech, doxxing, or NSFW content distribution via global chat or AI features.
- Rate limit evasion, worker pool abuse, or deliberate API throttling/flooding.
- Monetizing or redistributing BarnieBot's code or services without explicit permission.
- Broadcasting decrypted global chat exports or personal data from `b.messages` without user consent (owner use only for moderation).
- Attempting to social-engineer access to owner commands or staff ranks you do not hold.

## 5) Rate Limits & Behavior
- Global chat and AI endpoints are rate-limited. Requests may be queued or dropped during spikes.
- Translation workers and external services may throttle; delivery could be delayed.
- Sessions for AI chat are ephemeral; data clears when the session ends or restarts.

## 6) Data Handling Summary
- Global messages are encrypted at rest. See `privacy.md` for full details.
- Warnings, mutes, and blacklist states are recorded for moderation and safety.
- Minimal operational metadata (for example command usage) may be retained for diagnostics.

## 7) Security & Reporting
- Report vulnerabilities to: barniecorps@gmail.com.
- Do not publicly disclose exploits prior to fix/mitigation.
- BarnieBot may suspend features per-guild or per-user to maintain network health.

## 8) Enforcement
- We may restrict features, remove the bot from a guild, or escalate to Discord Trust & Safety.
- Global bans can be applied across the shared network for egregious violations.

## 9) Liability
BarnieBot is provided “AS IS” with no warranties. We are not liable for indirect or consequential damages arising from bot usage.

## 10) Changes
We may update this policy to reflect new features or requirements. Continued use after publication of changes constitutes acceptance.

## 11) Contact
- Email: barniecorps@gmail.com
- GitHub: https://github.com/Barnie-Corps/barniebot

© 2025 BarnieCorps. All rights reserved.

