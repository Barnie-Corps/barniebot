# BarnieBot Usage Policy

*Last Updated: October 21, 2025*

## 1. Overview
BarnieBot ("the Bot") connects Discord communities through AI chat, translation-enabled global chat, and moderation tooling. By inviting or interacting with the Bot you agree to follow this Usage Policy and Discord's Terms of Service.

## 2. Acceptable Use
- Operate the Bot for legitimate community management, entertainment, analytics, or educational purposes.
- Configure moderation, language, and custom-response features for your own guilds.
- Participate in the opt-in global chat network while respecting all communities involved.
- Use AI features responsibly, keeping prompts lawful and non-exploitative.

## 3. Staff and Owner Commands
Server owners listed in the `OWNERS` environment variable can issue privileged `b.` commands from the root command handler in `index.ts`. These commands include global announcements, forced restarts (`b.shutdown`), data exports (`b.messages`, `b.guilds`), Discord invite retrievals, VIP management (`b.add_vip`, `b.remove_vip`), guild statistics, and execution helpers (`b.eval`).

### Requirements
- Do not disclose or delegate staff credentials.
- Audit outputs (for example, message exports) before sharing them externally.
- Use the `b.eval` command only for debugging and never to access user secrets or perform destructive actions.

Unauthorized use of staff commands, impersonation of owners, or attempts to brute-force `OWNERS` identifiers are strictly forbidden and may trigger account bans and legal escalation.

## 4. Prohibited Activities
- Spamming, phishing, harassment, hate speech, or sharing NSFW content through any Bot channel.
- Tampering with rate-limiters, translation workers, or other anti-abuse systems.
- Injecting malicious payloads into owner-only commands or slash commands.
- Reverse engineering, reselling, or hosting unofficial BarnieBot instances without explicit permission.
- Broadcasting personal data obtained from BarnieBot exports without the data subject's consent.

## 5. Usage Limits and Service Behavior
- Global chat, AI chat, and translation services are rate-limited per user and per guild. BarnieBot may temporarily queue or drop requests when limits are reached.
- AI chat messages are kept in volatile memory only while a conversation is active and are cleared when either party ends the session.
- The `workers/translate.js` pool may delay delivery if external translation services throttle requests.
- Maintenance or emergency fixes may occur without prior notice. Critical updates will be announced through the support server when possible.

## 6. Data Handling Expectations
Operational data (see the Privacy Policy) includes encrypted global chat logs, command execution history, custom responses, and VIP status. Administrators must:
- Request data deletion or exports through the official channels listed in the Privacy Policy.
- Avoid storing sensitive personal information in custom responses, filter entries, or AI prompts.
- Notify users that BarnieBot may keep metadata (for example, command usage and translation requests) even when message content is not persisted.

## 7. Security and Incident Response
- Report vulnerabilities to barniecorps@gmail.com or via GitHub Issues.
- Do not publicly disclose exploits before the BarnieBot team confirms a fix.
- BarnieBot logs administrative actions and may suspend access to guilds abusing the service.

## 8. Enforcement
BarnieBot reserves the right to:
- Suspend or terminate access to specific commands, features, or entire guilds.
- Ban users across the global chat network via the `global_bans` table.
- Notify Discord Trust & Safety for egregious violations.
- Seek legal remedies for unauthorized access, data exfiltration, or service disruption.

## 9. Disclaimers and Liability
BarnieBot is provided "AS IS" without warranties of any kind. The developers are not liable for direct, indirect, incidental, or consequential damages arising from use or inability to use the Bot.

## 10. Changes to this Policy
We may update this Usage Policy to reflect new features, legal requirements, or security practices. Significant changes are announced in the support Discord server. Continued use after changes take effect constitutes acceptance of the revised policy.

## 11. Contact
- Email: barniecorps@gmail.com
- Discord: [Support Server](https://discord.com/invite/58Tt83kX9K)
- GitHub: [Barnie-Corps/barniebot Issues](https://github.com/Barnie-Corps/barniebot/issues)

© 2025 BarnieCorps. All rights reserved.

