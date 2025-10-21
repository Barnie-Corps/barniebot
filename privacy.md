# BarnieBot Privacy Policy

*Last updated: October 21, 2025*

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
- **Command execution logs** (`executed_commands`, `message_count`): command name, user ID, execution timestamp, and aggregate message counts.
- **Language preferences** (`languages` table) chosen through `/setlang`.
- **Global chat messages** (`global_messages`): encrypted body, author ID, language code, and timestamps.
- **Filter configuration data** (`filter_configs`, `filter_words`, `filter_webhooks`): guild-level moderation settings and reviewed terms.
- **VIP subscriptions** (`vip_users`): Discord ID plus start and end timestamps for premium feature access.
- **AI memories** (`ai_memories`): opt-in snippets created through AI interactions.
- **Registered RPG accounts** (`registered_accounts`, `logins`): email address, encrypted password payload, verification code, token, and login audit trail when using the optional RPG module.

### Feature-Specific Notes
- **AI Chat Sessions**: Conversations with `/ai chat` live only in memory for the duration of the session. When the user or AI ends the chat—or the process restarts—the conversation state is discarded. Function calls requested by the AI may log input arguments.
- **Global Chat**: Messages are encrypted via AES-256-CBC before database storage. Owner-only commands (`b.messages`) allow exporting decrypted transcripts for moderation purposes.
- **Email Delivery**: BarnieBot uses a Gmail SMTP transporter to send verification codes. The SMTP username and app password are stored as environment variables; mail contents are not kept after delivery except for standard provider logs.

We do **not** collect Discord passwords, billing details, or direct messages outside guilds where BarnieBot is present.

## How We Use Your Information
- Authenticate and tailor responses for commands, leaderboards, and guild configuration.
- Enforce rate limits and security measures (for example, global chat spam prevention).
- Provide AI responses via Google Generative AI, using message content as prompts and optionally performing function calls through `AIFunctions` in `utils.ts`.
- Translate text using worker threads that forward anonymized content to Google Translate (`google-translate-api-x`).
- Email verification codes during RPG registration and respond to support requests.

We do not sell personal information. Limited metadata may be shared with Discord or law enforcement when required by applicable law.

## Data Retention
- **Global chat logs**: Retained indefinitely for abuse investigations and network safety; exports are limited to BarnieBot owners.
- **Command execution history**: Last command is flagged for quick reference; historical entries may persist up to 90 days.
- **Message counts and language preferences**: Retained while a guild actively uses BarnieBot. Data is purged when a guild removes the Bot or upon verified deletion requests.
- **AI memories**: Stored until deleted by a staff member or via a verified request from the associated user.
- **RPG registration records**: Maintained while the account remains active. Verification codes are cleared after successful verification.

Requests for deletion or export can be sent to barniecorps@gmail.com. We may decline deletion when the data is necessary to detect abuse or comply with legal obligations.

## Data Security Measures
- AES-256-CBC encryption for sensitive message content (see `utils.encryptWithAES`).
- TLS-secured connections to Discord, Gmail SMTP, Google APIs, and MySQL.
- Access to owner commands is limited to the IDs defined in the `OWNERS` environment variable.
- Worker threads sanitize translations and AI inputs before forwarding to third-party APIs.
- Operational logs are monitored for misuse; `global_bans` can block repeat offenders across all guilds.

Despite these measures, no system can be 100% secure. Use BarnieBot at your own risk and avoid sharing highly sensitive information through its features.

## Third-Party Services
- **Discord** (hosting platform and API).
- **Google Generative AI** for `/ai` features.
- **Google Translate API (unofficial wrapper)** for multilingual global chat.
- **Gmail SMTP** for account verification emails.
- **Meme API (meme-api.com)** when invoking `/meme`.

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
- Discord: [Support Server](https://discord.com/invite/58Tt83kX9K)
- GitHub Issues: https://github.com/Barnie-Corps/barniebot/issues

By using BarnieBot you consent to the practices described in this Privacy Policy.

