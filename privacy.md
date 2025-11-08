# BarnieBot Privacy Policy

Last Updated: November 8, 2025

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
- **AI Chat Sessions**: Conversation history ephemeral; cleared on session end or bot restart. Function call execution metadata (arguments, user IDs) may be logged for diagnostics, but not full transcripts.
- **Global Chat**: Messages encrypted (AES-256-CBC) before storage. Owner commands like `b.messages` can export decrypted logs for a specific user (moderation/abuse investigation only). Spoofed staff suffixes automatically stripped from non-staff before broadcast.
- **Staff System**: Ranks stored in `staff` table. Moderation actions (warnings, mutes, blacklists) permanently recorded with author IDs and timestamps. No passwords or authentication credentials associated with staff status.
- **Email Delivery**: SMTP used for notifications; message bodies not retained after send.
- **Filter & Custom Responses**: Guild-controlled configurations; no cross-guild data sharing.

We do **not** collect Discord account passwords, payment details, private DM content (outside global chat network), or voice channel audio (AI voice mode processes in memory only).

## How We Use Your Information
- Authenticate and tailor responses for commands, leaderboards, and guild configuration.
- Enforce rate limits and security measures (for example, global chat spam prevention).
- Provide AI responses via Google Generative AI, using message content as prompts and optionally performing function calls through `AIFunctions` in `utils.ts`.
- Translate text using worker threads that forward anonymized content to Google Translate (`google-translate-api-x`).
- Email verification codes during RPG registration and respond to support requests.

We do not sell personal information. Limited metadata may be shared with Discord or law enforcement when required by applicable law.

## Data Retention
- Global chat logs: Indefinite (abuse tracing); encrypted.
- Command executions & message counts: Up to ~90 days rolling.
- Language preferences: Retained while user active or until deletion request.
- Moderation actions: Warnings permanent; mutes auto-removed post-expiry; blacklist rows retained with active flag.
- AI memories: User-controlled deletion.
- VIP records: Retained through subscription + short audit window.

Requests for deletion or export can be sent to barniecorps@gmail.com. We may decline deletion where retention is required for abuse tracing or legal obligations (e.g., persistent warning history).

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

