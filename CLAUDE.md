# Agent K — Telegram Bot (Claude Code Interface)

A Telegram bot that acts as a conversational interface to the Claude Code CLI. Users send messages via Telegram; the bot forwards them to Claude, maintains session continuity, and returns responses. It also supports media uploads, file delivery, and web search via Playwright.

---

## Project Structure

```
Agent_K_Telegram-main/
├── src/
│   ├── index.js          # Bot entrypoint — Telegraf handlers, webhook/polling setup
│   ├── claude-runner.js  # Spawns Claude CLI via execSync, parses JSON output
│   ├── database.js       # SQLite via better-sqlite3 — sessions + audit_log tables
│   └── utils.js          # Auth check, message splitting, markdown→HTML conversion
├── search-news.js        # Standalone Playwright script — scrapes AI/accounting news
├── search-image.js       # Standalone Playwright script — searches Google Images
├── logs/                 # Runtime logs & history (git-ignored)
│   ├── activity/         # Per-day activity logs (YYYY-MM-DD.log)
│   └── history/          # Per-user conversation history exports
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

1. Copy `.env.example` to `.env` and fill in all values
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Playwright browser:
   ```bash
   npx playwright install chromium
   ```
4. Ensure Claude CLI is installed and authenticated:
   ```bash
   claude --version
   ```

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

## Environment Variables

| Variable               | Description                                          |
|------------------------|------------------------------------------------------|
| `TELEGRAM_BOT_TOKEN`   | Bot token from @BotFather                           |
| `ANTHROPIC_API_KEY`    | Anthropic API key for Claude                        |
| `SUPABASE_URL`         | Supabase project URL (optional)                     |
| `SUPABASE_KEY`         | Supabase service role key (optional)                |
| `ALLOWED_TELEGRAM_IDS` | Comma-separated Telegram user IDs allowed to use bot |
| `WORKSPACE_DIR`        | Directory where Claude operates on files            |
| `WEBHOOK_URL`          | HTTPS webhook URL (optional — falls back to polling)|
| `PORT`                 | Server port (default: 3000)                         |
| `DB_PATH`              | SQLite database path (default: `data/bot.db`)       |

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

---

## Key Behaviours

- **Session continuity** — Claude session IDs are stored in SQLite and resumed per user via `--resume`
- **Duplicate protection** — `processingUsers` map prevents concurrent requests per user; auto-clears after 5 minutes
- **File delivery** — Claude responses can include `[SEND_IMAGE: path]` and `[SEND_FILE: path]` tags to trigger file sends
- **Media uploads** — Photos and documents sent to the bot are downloaded to `WORKSPACE_DIR` then passed to Claude
- **Message formatting** — Markdown responses are converted to Telegram HTML; tables are reformatted for readability
- **Auth** — All requests checked against `ALLOWED_TELEGRAM_IDS`

---

## Logs Directory

The `logs/` folder is **git-ignored** and created automatically at runtime. Do not commit it.

```
logs/
├── activity/     # Daily activity logs — format: YYYY-MM-DD.log
└── history/      # Per-user conversation exports — format: <userId>-history.log
```

When writing activity logs or history files, always use this directory.
Use `path.join(__dirname, '..', 'logs', 'activity')` for activity logs
and `path.join(__dirname, '..', 'logs', 'history')` for history files.

---

## Deployment

**Docker:**
```bash
docker build -t agent-k .
docker run -d --env-file .env agent-k
```

**Zeabur:** Config is in `zeabur.json`. Push to repo and connect via Zeabur dashboard.

Set `WEBHOOK_URL` to your public HTTPS URL for production. Without it, the bot falls back to long polling.
