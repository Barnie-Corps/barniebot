# Contributing to BarnieBot

Thank you for considering contributing to BarnieBot! This document outlines the process and guidelines for contributing to the project.

## 📋 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Contribution Process](#contribution-process)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Bug Reports](#bug-reports)

## Code of Conduct
Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We expect all contributors to uphold these guidelines to maintain a positive and inclusive community.

## Development Setup

### Prerequisites
- Node.js 18+ (Discord.js v14 baseline)
- TypeScript (local install is fine; no global requirement)
- MySQL 5.7+ / MariaDB with a dedicated database
- Discord application & bot token

### Initial Setup
```bash
git clone https://github.com/Barnie-Corps/barniebot.git
cd barniebot
npm install
cp .env.example .env   # then edit secrets
npx ts-node index.ts   # dev run
```

### Notes
- Keep the polyfill lines at the top of `index.ts` (web streams & fetch).
- The project no longer tracks a runtime version variable; remove any lingering references when contributing.
- Use feature branches (`feature/<name>` or `fix/<name>`). Avoid committing directly to `master`.
- Keep commits focused—prefer multiple small commits over one giant diff.

## Contribution Process

1. Create a new branch for your feature/fix:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes:
   - Write clean, documented code
   - Add tests if applicable
   - Update documentation as needed

3. Test thoroughly:
   - Run the bot locally
   - Test all affected features
   - Ensure no new bugs are introduced

## Coding Standards

- Favor clarity over cleverness; avoid deep nesting by early returns.
- Use `async/await`; do not introduce new promise libraries.
- Keep public helper functions documented with brief JSDoc (inputs, outputs, error modes).
- Apply single-responsibility: one concern per function.
- Avoid hardcoding secrets or tokens in commits.
- Match existing indentation & style; do not mass reformat unrelated areas.

## Pull Request Process

1. Sync with `master` before opening.
2. Ensure the bot boots locally without TypeScript errors.
3. Describe:
   - Motivation (problem / enhancement)
   - Implementation summary (key files, data flows)
   - Any schema changes (tables / columns)
4. Include manual test notes or screenshots for UI (embeds, buttons).
5. Security / privacy impact (if any) — e.g., new stored data.
6. Respond to review comments within a reasonable timeframe.

## Bug Reports

Include:
- Precise reproduction steps
- Expected vs actual output
- Environment (OS, Node.js version)
- Relevant logs (avoid posting secrets)
- If worker related: indicate if issue occurs after idle period.

## Questions or Need Help?

- Join our [Discord server](https://discord.com/invite/58Tt83kX9K)
- Email us at barniecorps@gmail.com
- Check existing issues and discussions

Thank you for helping improve BarnieBot! 🚀

---
BarnieCorps Team