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
- Node.js 16.x or higher
- TypeScript
- MySQL database
- A Discord application and bot token

### Initial Setup
1. Fork and clone the repository:
```bash
git clone https://github.com/yourusername/barniebot.git
cd barniebot
```

2. Install global dependencies:
```bash
npm install --location=global typescript @types/node ts-node
```

3. Install project dependencies:
```bash
npm install
```

4. Configure your development environment:
   - Copy `.env.example` to `.env`
   - Fill in your Discord bot token and other required values

### Important Notes
- Never remove the `global.ReadbleStream = require('web-streams-polyfill').ReadableStream;` line from `index.ts`
- Replace the comment header in `index.ts` with content from `based.txt`
- Use `ts-node` for development to speed up testing

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

- Use TypeScript features appropriately
- Follow existing code formatting
- Comment complex logic
- Use meaningful variable/function names
- Keep functions focused and concise
- Add JSDoc comments for public APIs

## Pull Request Process

1. Update your fork with the latest main branch changes
2. Ensure all tests pass
3. Write a clear PR description:
   - What changes were made
   - Why they were necessary
   - How to test them
4. Link any related issues
5. Wait for review and address feedback

## Bug Reports

When reporting bugs, please include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Bot version and environment details
- Relevant logs or screenshots

## Questions or Need Help?

- Join our [Discord server](https://discord.com/invite/58Tt83kX9K)
- Email us at barniecorps@gmail.com
- Check existing issues and discussions

Thank you for contributing to BarnieBot! 🚀

---
BarnieCorps Team