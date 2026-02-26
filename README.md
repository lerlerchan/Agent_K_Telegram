# Agent K — Telegram Bot powered by Claude

A Telegram bot that acts as a conversational interface to Claude Code CLI.
Users send messages via Telegram; the bot forwards them to Claude, maintains
session continuity, and returns responses.

## Features

- Conversational AI via Claude Code CLI
- Session continuity per user
- Media uploads (photos, documents)
- File delivery via Telegram
- Smart MCP loading (Playwright, Gmail, Chrome DevTools)
- 13 built-in skills (invoicing, HR contracts, email, spreadsheets, etc.)

## Prerequisites

- Node.js 20+
- Claude Code CLI (installed and authenticated)
- Telegram Bot Token (from @BotFather)
- Gmail account for the agent (recommended: create a dedicated one)

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd Agent_K_Telegram
npm install
```

### 2. Run setup

```bash
./scripts/setup.sh
```

This interactive script will:
- Install dependencies (if needed)
- Symlink skills to `~/.claude/skills/`
- Configure `.env` (bot token, company info, etc.)
- Set up Gmail API access (optional but recommended)
- Check prerequisites (Claude CLI, Playwright)

### 3. Start the bot

```bash
npm start
```

## Manual Setup (if not using setup.sh)

### Environment Variables

Copy `.env.example` to `.env` and fill in values. See `.env.example` for all available variables and descriptions.

**Required:**
- `TELEGRAM_BOT_TOKEN` — Bot token from @BotFather
- `ALLOWED_CHAT_IDS` — Comma-separated chat IDs the bot responds in

### Skills

Skills are Claude Code slash commands stored in `skills/`.
Run `./scripts/setup-skills.sh` to symlink them to `~/.claude/skills/`.

New skills added to `skills/` are automatically available — no re-run needed.

### Gmail Setup

For email sending, you need Gmail API OAuth credentials:

1. Create a Gmail account for your agent
2. Go to console.cloud.google.com — create project — enable Gmail API
3. Create OAuth 2.0 Desktop credentials — download JSON
4. Run: `python3 scripts/gmail-auth.py path/to/client_secret.json`
5. Log in with your agent's Gmail when the browser opens

### Claude Code Config

Copy `config/CLAUDE.md.template` to `~/.claude/CLAUDE.md` and fill in your values.
This gives Claude its personality and operating instructions.

## Architecture

```
Telegram User
     |
     v
+-------------------------------------+
|         Agent K Bot                  |
|  +-----------------------------+    |
|  |   Telegraf (Bot Framework)  |    |
|  +-----------------------------+    |
|              |                      |
|  +-----------+-----------+          |
|  v                       v          |
| Auth                  Express       |
| Middleware            (Webhook)     |
|  |                                  |
|  v                                  |
| Claude Runner --> Claude Code CLI   |
|  |               (skip-permissions) |
|  v                                  |
| SQLite DB                           |
| (sessions + audit)                  |
+-------------------------------------+
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and command list |
| `/new` | Clear session, start new conversation |
| `/status` | Check bot status, session, and workspace |
| `/cd <path>` | Change workspace directory |
| `/sendfile <name>` | Send a file from workspace |
| `/test` | Test Claude CLI availability |
| `/cancel` | Cancel in-progress request |
| `/chatid` | Show current chat ID |

## Project Structure

```
Agent_K_Telegram/
├── src/               # Bot runtime
│   ├── index.js       # Main bot entry, commands, handlers
│   ├── claude-runner.js # Claude Code CLI wrapper
│   ├── database.js    # SQLite session & audit logging
│   └── utils.js       # Auth, message splitting, markdown
├── skills/            # Claude Code skills (13 skills)
├── scripts/           # Setup and utility scripts
├── config/            # Configuration templates
├── data/              # SQLite database (git-ignored)
├── Dockerfile
├── .env.example
└── package.json
```

## Deployment

### Polling (simplest)

```bash
npm start
```

No webhook needed — bot polls Telegram for updates.

### Docker

```bash
docker build -t agent-k .
docker run -d --env-file .env agent-k
```

### Zeabur

Push to GitHub and connect via [zeabur.com](https://zeabur.com). Add environment variables in the dashboard.

## Security

- **Chat whitelist**: Only chats listed in `ALLOWED_CHAT_IDS` receive responses
- **User whitelist**: `ALLOWED_TELEGRAM_IDS` restricts by user ID
- **Permissions bypass**: `--dangerously-skip-permissions` is enabled — restrict access via whitelists
- **Audit logging**: All messages logged to SQLite

## License

MIT
