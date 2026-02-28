# Agent K — Telegram Bot (Claude Code Interface)

A Telegram bot that acts as a conversational interface to the Claude Code CLI. Users send messages via Telegram; the bot forwards them to Claude, maintains session continuity, and returns responses. It also supports media uploads, file delivery, and web search via Playwright.

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
| `/flight-checkin` | check in, boarding pass | Online flight check-in via Playwright |
| `/mac-setup` | set up Mac, auto-login | Headless Mac Mini setup guide for Agent K |

**Adding new skills:** Create a directory in `skills/` with a `SKILL.md` file. It will be automatically available via the whole-directory symlink.

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

## Logs Directory

The `logs/` folder is **git-ignored** and created automatically at runtime. Do not commit it.

```
logs/
├── activity/     # Daily activity logs — format: YYYY-MM-DD.log
└── history/      # Per-user conversation exports — format: <userId>-history.log
```

---

## Deployment

**Docker:**
```bash
docker build -t agent-k .
docker run -d --env-file .env agent-k
```

**Zeabur:** Config is in `zeabur.json`. Push to repo and connect via Zeabur dashboard.

Set `WEBHOOK_URL` to your public HTTPS URL for production. Without it, the bot falls back to long polling.
