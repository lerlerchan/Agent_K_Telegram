# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Agent K — Telegram Bot (Claude Code Interface)

A Telegram bot that acts as a conversational interface to the Claude Code CLI. Users send messages via Telegram; the bot forwards them to Claude, maintains session continuity, and returns responses. It also supports media uploads, file delivery, and web search via Playwright.

---

## Hardware Requirements

Agent K has two deployment tiers depending on which features you need:

| Tier | What's included |
|------|-----------------|
| **Core** | Telegram ↔ Claude message relay only. No Playwright, no PDF/Office skills. |
| **Full stack** | Core + Playwright browser automation, Gmail/Drive, PDF/Word/Excel/PowerPoint skills. |

### Minimum Specs by Platform

| Platform | Tier | CPU | RAM | Disk | OS Version |
|----------|------|-----|-----|------|------------|
| Mac Mini / MacBook | Core | 2-core Apple Silicon or Intel | 4 GB | 5 GB | macOS 12+ |
| Mac Mini / MacBook | Full | 2-core Apple Silicon or Intel | 8 GB | 10 GB | macOS 12+ |
| Windows laptop | Core | 2-core x64 | 4 GB | 5 GB | Win 10 21H2+ (64-bit) |
| Windows laptop | Full | 4-core x64 | 8 GB | 15 GB* | Win 10 21H2+ |
| Ubuntu / Linux | Core | 2-core x64 | 2 GB | 5 GB | Ubuntu 20.04+ |
| Ubuntu / Linux | Full | 4-core x64 | 4 GB | 10 GB | Ubuntu 20.04+ |
| Docker (any host) | Full | 2 vCPU | 4 GB allocated | 10 GB | Docker Desktop 4.x+ |

\* Windows disk is higher due to WSL2 + Visual C++ Build Tools overhead.

**Disk space breakdown:** Node.js 20 (~160 MB) + node_modules without Playwright (~200 MB) + Playwright Chromium binary (~1.1 GB) + Claude CLI (~300 MB) + SQLite DB and logs (~50 MB) + workspace buffer (1–5 GB).

### Per-Platform Setup Notes

**macOS**
- Install Node 20 via `brew install node@20` or `nvm install 20`
- Full Disk Access may be required for the Node.js process (System Settings → Privacy & Security → Full Disk Access)
- `PLAYWRIGHT_CHROME_PATH` is auto-detected; no manual config needed in most cases

**Windows (native, no WSL)**
- Requires Visual C++ Build Tools for `better-sqlite3` native compilation — install via `npm install --global windows-build-tools` or [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
- Install Node.js v20 LTS from [nodejs.org](https://nodejs.org)
- Use `start-agent-k.bat` / `stop-agent-k.bat` for process management
- Set `PLAYWRIGHT_CHROME_PATH` manually if Chrome is not in the standard install path

**Ubuntu / Linux**
- Install build tools: `sudo apt install build-essential python3`
- Install Node 20 via `nvm` or the NodeSource PPA
- Playwright system library dependencies (26 packages) are installed automatically via `npx playwright install --with-deps chromium`

**Docker (recommended for consistency)**
- The included Dockerfile bundles all 26 system libraries, Claude CLI, and Playwright Chromium — no host-side setup needed
- Works identically on Mac, Windows, and Linux hosts
- Allocate ≥ 4 GB RAM in Docker Desktop settings (Resources → Memory)
- Run with: `docker run -d --env-file .env agent-k`

> **Docker as a leveller:** If you're on an old Windows laptop or any non-Linux machine, running Agent K via Docker is the most reliable path to a working full-stack deployment. The Dockerfile handles all platform-specific system dependencies so you don't have to.

---

## Development Commands

```bash
# Install dependencies
npm install

# Run in development (auto-restart on file changes)
npm run dev

# Run in production
npm start

# Windows batch scripts
start-agent-k.bat          # Start the bot
stop-agent-k.bat           # Stop the bot

# Initial setup (interactive)
./scripts/setup.sh

# Symlink skills to ~/.claude/skills/ (auto-run by setup.sh)
./scripts/setup-skills.sh

# Set up Gmail OAuth tokens
python3 scripts/gmail-auth.py path/to/client_secret.json
```

---

## Project Structure

```
Agent_K_Telegram/
├── src/
│   ├── index.js          # Bot entrypoint — Telegraf handlers, webhook/polling setup
│   ├── claude-runner.js  # Spawns Claude CLI via spawn, parses JSON output
│   ├── database.js       # SQLite via better-sqlite3 — sessions + audit_log tables
│   └── utils.js          # Auth check, message splitting, markdown→HTML conversion
├── skills/               # Claude Code skills (symlinked to ~/.claude/skills/)
│   ├── check-email/      # Check Gmail inbox
│   ├── compact/          # Pre-compact memory flush
│   ├── excel/            # Excel file operations
│   ├── git-push/         # Git commit and push
│   ├── google-sheets/    # Google Sheets operations
│   ├── hr-payroll/       # Employment contracts (build_contract.py, setup_db.py)
│   ├── issue-invoice/    # Invoice generation (build_pdf.py, setup_db.py)
│   ├── powerpoint/       # PowerPoint operations
│   ├── repo-check/       # Pre-commit audit checklist
│   ├── send-email/       # Email sending (send_email.py)
│   ├── send-file/        # File delivery via Telegram
│   ├── send-telegram/    # Telegram message sending
│   └── word/             # Word document operations
├── scripts/
│   ├── setup.sh          # First-run interactive setup
│   ├── setup-skills.sh   # Symlink skills to ~/.claude/skills/
│   └── gmail-auth.py     # Gmail OAuth token setup
├── config/
│   └── CLAUDE.md.template # Template for ~/.claude/CLAUDE.md
├── search-news.js        # Standalone Playwright script — scrapes AI/accounting news
├── search-image.js       # Standalone Playwright script — searches Google Images
├── supabase-schema.sql   # Optional Supabase schema (alternative to SQLite)
├── playwright.config.js  # Playwright browser config
├── Dockerfile            # Container setup (Node 20 + Playwright + Claude CLI)
├── zeabur.json           # Zeabur cloud deployment config
├── start-agent-k.bat     # Windows start script
├── stop-agent-k.bat      # Windows stop script
├── .env.example          # Environment variable template
└── CLAUDE.md             # This file
```

---

## Setup

1. Run the interactive setup script:
   ```bash
   ./scripts/setup.sh
   ```
   Or manually:
   1. Copy `.env.example` to `.env` and fill in values
   2. `npm install`
   3. `./scripts/setup-skills.sh` (symlink skills)
   4. `npx playwright install chromium`
   5. Verify Claude CLI: `claude --version`

---

## Running

```bash
# Development (auto-restart on file change)
npm run dev

# Production
npm start

# Windows
start-agent-k.bat
```

---

## Skills

Skills are Claude Code slash commands stored in `skills/`. They are symlinked to `~/.claude/skills/` via `scripts/setup-skills.sh`.

| Skill | Trigger | Description |
|-------|---------|-------------|
| `/check-email` | check email, inbox | Check Gmail inbox for new messages |
| `/compact` | compact | Pre-compact memory flush to daily log |
| `/excel` | create/edit Excel | Excel file operations via MCP |
| `/git-push` | push, commit | Git commit and push to GitHub |
| `/google-sheets` | Google Sheets | Read/write Google Sheets via MCP |
| `/hr-payroll` | employment contract | Generate employment contracts (PDF) |
| `/issue-invoice` | invoice | Generate invoices (PDF) with email delivery |
| `/powerpoint` | slides, presentation | PowerPoint operations via MCP |
| `/repo-check` | (auto after changes) | Security/setup audit before committing |
| `/send-email` | send email | Send emails via Gmail API |
| `/send-file` | send file | Deliver files via Telegram |
| `/send-telegram` | send telegram | Send Telegram messages |
| `/word` | Word document | Word document operations via MCP |
| `/web-search` | search, google, look up, find info, what is, latest news | Search the web via DuckDuckGo MCP and return live results |
| `/flight-checkin` | check in, boarding pass | Online flight check-in via Playwright |
| `/mac-setup` | set up Mac, auto-login | Headless Mac Mini setup guide for Agent K |

**Adding new skills:** Create a directory in `skills/` with a `SKILL.md` file. It will be automatically available via the whole-directory symlink.

## Live Web Search (Important)

**NEVER answer questions about current events, news, prices, or anything time-sensitive from training data alone.**

A DuckDuckGo MCP server (`duckduckgo`) is available. Use it proactively whenever the user asks about:
- Latest news, current events, recent developments
- Prices, exchange rates, stock values
- "What is X", "Who is X", "When did X happen"
- Anything that may have changed since your training cutoff

**How to search:** Use the `duckduckgo` MCP tool directly, or trigger the `/web-search` skill. Always search first, then answer based on the live results. Never say "my knowledge cutoff is X" — just search instead.

---

## Environment Variables

| Variable               | Description                                          |
|------------------------|------------------------------------------------------|
| `TELEGRAM_BOT_TOKEN`   | Bot token from @BotFather (required)                |
| `ALLOWED_CHAT_IDS`     | Comma-separated chat IDs the bot responds in        |
| `ALLOWED_TELEGRAM_IDS` | Comma-separated user IDs allowed to use bot         |
| `WORKSPACE_DIR`        | Directory where Claude operates on files            |
| `COMPANY_NAME`         | Company name for invoices/contracts                 |
| `COMPANY_REG`          | Company registration number                         |
| `COMPANY_SST_NO`       | SST registration number                             |
| `COMPANY_ADDRESS`      | Company address (no country)                        |
| `COMPANY_CONTACT_NAME` | Contact person name                                 |
| `COMPANY_CONTACT_TITLE`| Contact person title                                |
| `COMPANY_EMAIL`        | Company email                                       |
| `BANK_NAME`            | Bank name for payment details                       |
| `BANK_ACCT_NAME`       | Bank account name                                   |
| `BANK_ACCT_NO`         | Bank account number                                 |
| `FROM_NAME`            | Email display name                                  |
| `FROM_EMAIL`           | Email sender address                                |
| `CC_EMAILS`            | CC recipients for outbound emails                   |
| `TELEGRAM_GROUP_CHAT_ID`| Telegram group for file delivery                   |
| `TELEGRAM_DM_CHAT_ID`  | Telegram DM for private delivery                    |
| `WEBHOOK_URL`          | HTTPS webhook URL (optional — falls back to polling)|
| `PORT`                 | Server port (default: 3000)                         |
| `DB_PATH`              | SQLite database path (default: `data/bot.db`)       |
| `PLAYWRIGHT_CHROME_PATH`| Chrome path for Playwright (auto-detect if unset)  |

---

## Bot Commands

| Command           | Description                              |
|-------------------|------------------------------------------|
| `/start`          | Welcome message and command list         |
| `/new`            | Start a fresh Claude conversation        |
| `/status`         | Show bot status, session, and workspace  |
| `/test`           | Verify Claude CLI is working             |
| `/cancel`         | Cancel current in-progress request       |
| `/cd <path>`      | Change the active workspace directory    |
| `/sendfile <name>`| Send a file from the workspace           |
| `/chatid`         | Show current chat ID                     |

---

## Key Behaviours

- **Session continuity** — Claude session IDs are stored in SQLite and resumed per user via `--resume`
- **Duplicate protection** — `processingUsers` map prevents concurrent requests per user; auto-clears after 30 minutes
- **File delivery** — Claude responses can include `[SEND_IMAGE: path]` and `[SEND_FILE: path]` tags to trigger file sends
- **Media uploads** — Photos and documents sent to the bot are downloaded to `WORKSPACE_DIR` then passed to Claude
- **Message formatting** — Markdown responses are converted to Telegram HTML; tables are reformatted for readability
- **Smart MCP** — MCP servers (Playwright, Gmail, Chrome DevTools) only loaded when message keywords match

---

## Architecture Deep Dive

### Request Flow

```
Telegram User Message
         |
         v
     Telegraf middleware (auth + filtering)
         |
         v
     Message Handler
      /    |    \
     /     |     \
  Text   Photo  Document
    |      |       |
    +------+-------+
           |
           v
   detectMcpServers()  [checks keywords to load only needed MCP servers]
           |
           v
   isComplexTask()     [checks patterns to decide Haiku vs Opus]
           |
           v
   runClaude()         [spawns Claude CLI with --resume flag]
           |
           v
   Parse JSON output → Extract [SEND_IMAGE:] and [SEND_FILE:] tags
           |
           v
   sendResponse()      [splits markdown, converts to HTML, sends via Telegram]
           |
           v
   logMessage()        [audit log to SQLite + daily logs/activity/YYYY-MM-DD.log]
```

### Key Components

- **[index.js](src/index.js)** — Telegraf setup, middleware, command handlers, response formatting
  - `processingUsers` Map prevents concurrent requests per user (auto-clears after 30 min)
  - File tag extraction: `[SEND_IMAGE: path]` and `[SEND_FILE: path]` trigger media sends
  - Markdown → HTML conversion for Telegram formatting

- **[claude-runner.js](src/claude-runner.js)** — Claude CLI spawning and session management
  - `detectMcpServers()` — loads MCP servers (Playwright, Gmail, Chrome DevTools) only when keywords match
  - `isComplexTask()` — pattern-based detection to use Opus for browser automation and multi-step workflows
  - `buildSystemContext()` — injects memory from ~/.claude/memory/ into Claude prompt
  - Session IDs stored in SQLite, resumed with `--resume` flag to maintain continuity
  - Logs to `logs/activity/YYYY-MM-DD.log` with timestamps

- **[database.js](src/database.js)** — SQLite via better-sqlite3
  - `sessions` table — per-user Claude session IDs + MCP keys + last activity timestamp
  - `audit_log` table — all user messages and bot responses (for audit trail)
  - 15-minute session TTL — sessions auto-expire on inactivity
  - WAL mode for concurrent write safety

- **[utils.js](src/utils.js)** — Helpers for auth, splitting, formatting
  - User/chat whitelist validation
  - Message splitting (Telegram 4096 char limit)
  - Markdown table reformatting for readability in Telegram

### Skills System

Skills are Claude Code slash commands stored in `skills/`. Each skill is a directory with a `SKILL.md` file defining:

```yaml
---
name: skill-name
description: What this skill does
---
[Markdown body with workflow/rules/arguments]
```

- Symlinked to `~/.claude/skills/` via `scripts/setup-skills.sh`
- New skills in `skills/` are automatically available (no re-run needed)
- Skills are invoked via Claude's `/skill-name` syntax in the bot message
- Example: `/git-push` — commit and push to GitHub with PAT auth

### Environment & Configuration

**Critical .env vars:**
- `TELEGRAM_BOT_TOKEN` — required, from @BotFather
- `ALLOWED_CHAT_IDS` — comma-separated IDs; bot only responds in these chats
- `WORKSPACE_DIR` — directory where Claude operates on files
- `WEBHOOK_URL` — optional HTTPS URL for webhook mode (falls back to polling)

**Company/Bank/Email vars** — used by `/hr-payroll`, `/issue-invoice`, `/send-email` skills

**Google Cloud OAuth** — Gmail/Sheets/Drive skills need OAuth tokens in `~/.gmail-mcp/`, `~/.gdrive-mcp/`

---

## Logs Directory

The `logs/` folder is **git-ignored** and created automatically at runtime. Do not commit it.

```
logs/
├── activity/     # Daily activity logs — format: YYYY-MM-DD.log (rotation: one per day)
└── history/      # Per-user conversation exports — format: <userId>-history.log
```

Activity logs contain timestamped entries: `[HH:MM:SS] [LEVEL] message`

---

## Deployment

**Docker:**
```bash
docker build -t agent-k .
docker run -d --env-file .env agent-k
```

**Zeabur:** Config is in `zeabur.json`. Push to repo and connect via Zeabur dashboard.

Set `WEBHOOK_URL` to your public HTTPS URL for production. Without it, the bot falls back to long polling.
