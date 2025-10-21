# BarnieBot

![GitHub license](https://img.shields.io/github/license/Barnie-Corps/barniebot?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/Barnie-Corps/barniebot?style=flat-square)

BarnieBot is a TypeScript-powered Discord bot that links communities together with global chat, AI-assisted conversations, moderation tooling, and rich server analytics.

## Highlights
- AI chat built on Google Gemini with optional function calling for automation
- Opt-in global chat network with automatic translation workers and AES-encrypted logging
- Message filters, custom responses, and VIP-only perks to tailor each guild experience
- Owner tooling (`b.` prefix commands) for announcements, restarts, data exports, and VIP management
- MySQL-backed storage with worker-thread powered translation and SMTP email delivery

## Requirements
- Node.js 18 LTS or newer (Discord.js v14 requirement)
- npm 9+ or compatible package manager
- MySQL 5.7+ (InnoDB) with a database dedicated to BarnieBot
- Google Generative AI key (Gemini) for the `/ai` commands
- SMTP account capable of sending transactional mail (Gmail supported)

## Setup
1. **Clone the repository**
	```bash
	git clone https://github.com/Barnie-Corps/barniebot.git
	cd barniebot
	```
2. **Install dependencies**
	```bash
	npm install
	npm install --save-dev typescript ts-node
	```
	The codebase assumes TypeScript tooling is locally available; the commands above add it if you do not already have it.
3. **Provision the database**
	- Create a MySQL database and user with full privileges.
	- The bot auto-creates tables on startup through `mysql/queries.ts`.
4. **Create a `.env` file** (example values below):
	```env
	TOKEN=your-discord-bot-token
	DISCORD_BOT_ID=your-application-id
	OWNERS=123456789012345678,234567890123456789
	VERSION=1.0.0
	DB_HOST=127.0.0.1
	DB_USER=barniebot
	DB_PASSWORD=super-secret
	DB_NAME=barniebot
	ENCRYPTION_KEY=base64-encoded-32-byte-key
	AI_API_KEY=your-google-gemini-key
	EMAIL_PASSWORD=app-specific-password
	NOTIFY_STARTUP=1
	SAFELY_SHUTTED_DOWN=1
	TEST=0
	INGORE_GLOBAL_CHAT=0
	SEARCH_ENGINE_API_KEY=optional-google-custom-search-key
	SEARCH_ENGINE_CX=optional-google-custom-search-engine-id
	SYSTEM_IP=optional-public-ip-for-masking
	```
	- `OWNERS` controls who may run privileged `b.` prefixed commands.
	- `ENCRYPTION_KEY` must be a base64 string representing 32 random bytes for AES-256-CBC.
	- Leave optional keys blank if you do not use that feature.

## Running Locally
- **Compile and run**
  ```bash
  npx tsc
  node dist/index.js
  ```
- **or run with ts-node during development**
  ```bash
  npx ts-node index.ts
  ```

On first boot, BarnieBot registers slash commands, ensures database tables exist, and spins up translation workers. Use the `OWNERS` accounts to run `b.` commands if you need to announce restarts or seed VIP access.

## Key Systems
- **Global Chat**: Bridges configured channels across guilds, optionally auto-translating messages before dispatch. Messages are encrypted at rest and can be exported by staff for moderation.
- **AI Chat**: `/ai chat` maintains a contextual session using Google Gemini; `/ai ask` provides single-shot answers. VIP status (stored in MySQL) gates access.
- **Moderation Tools**: `/filter`, `/globalchat`, `/custom_responses`, and `/setlang` commands store guild settings in MySQL and surface across restarts.
- **Owner Tools**: `b.shutdown`, `b.announce`, `b.messages`, `b.guilds`, `b.eval`, `b.add_vip`, `b.remove_vip`, and `b.fetch_guilds_members` require an ID in `OWNERS` and are intended for staff operations only.
- **Workers & Utilities**: Translation runs inside worker threads (`workers/translate.js`) to keep Discord events responsive; long-lived caches and AES helpers live in `utils.ts`.

## Contributing
We welcome pull requests! Review the [Contributing Guidelines](CONTRIBUTING.md) and open an issue before tackling larger changes. Please follow the coding conventions defined in the existing TypeScript files and add documentation for new commands or policies.

## Security & Privacy
- Sensitive operations (global chat exports, VIP changes, eval) are locked to owners.
- Global messages are AES-256 encrypted before storage in MySQL.
- The [privacy policy](privacy.md) and [usage policy](usage_policy.md) describe what is collected and how staff commands operate.
- Report security concerns through the process defined in [SECURITY.md](SECURITY.md).

## Support & Contact
- Email: barniecorps@gmail.com
- GitHub: [@Barnie-Corps](https://github.com/Barnie-Corps)
- Discord Invite: https://discord.com/invite/58Tt83kX9K

---
Made with ❤️ by BarnieCorps
