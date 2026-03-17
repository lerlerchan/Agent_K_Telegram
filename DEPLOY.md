# Deploy Agent K — Ubuntu + Ollama + New Telegram Bot

A step-by-step deployment guide for running Agent K on Ubuntu using Ollama as the LLM
(no Anthropic API key or Claude CLI required).

To execute this guide in a future session, say:
> "Read DEPLOY.md and deploy Agent K for me — run all commands and verify each step."

---

## Status Tracker

Mark each phase done as you go. Claude can resume from any incomplete phase.

- [ ] Phase 1 — Ubuntu prerequisites
- [ ] Phase 2 — Ollama install + model pull
- [ ] Phase 3 — New Telegram bot
- [ ] Phase 4 — Bot installation
- [ ] Phase 5 — Code change (OLLAMA_ONLY) — **already done** as of 2026-03-11
- [ ] Phase 6 — Configure .env
- [ ] Phase 7 — Gmail OAuth (optional)
- [ ] Phase 8 — Start the bot
- [ ] Phase 9 — Verification

---

## Phase 1 — Ubuntu Prerequisites

```bash
sudo apt update && sudo apt install -y build-essential python3 python3-pip git curl

# Install Node.js 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version   # must show v20.x.x
npm --version    # must show 10.x.x or higher
```

**Verify:** `node --version` outputs `v20.x.x` before continuing.

---

## Phase 2 — Ollama Install + Model Pull

```bash
curl -fsSL https://ollama.com/install.sh | sh
# Ollama installs as a systemd service and starts automatically

# Pull model (choose one — llama3.2 recommended for speed):
ollama pull llama3.2        # ~2 GB — fast, good general use
# ollama pull qwen2.5:7b   # ~4.7 GB — strong multilingual
# ollama pull mistral       # ~4.1 GB — solid alternative

# Verify
ollama list
curl http://localhost:11434/api/tags   # must return JSON with your model listed
```

**Verify:** `ollama list` shows at least one model before continuing.

---

## Phase 3 — New Telegram Bot

These steps are manual (done in the Telegram app):

1. Message **@BotFather** → send `/newbot` → follow prompts → **save the token**
2. In @BotFather: `/mybots` → select your bot → Bot Settings → Group Privacy → **Turn OFF**
   (required for the bot to read messages in groups)
3. Find your Telegram user ID: message **@userinfobot** → save the number
4. Start your new bot, send any message, then use `/chatid` once the bot is running to get your chat ID

**Save these values — needed in Phase 6:**
- Bot token: `TELEGRAM_BOT_TOKEN`
- Your Telegram user ID: `ALLOWED_TELEGRAM_IDS`
- Your chat ID: `ALLOWED_CHAT_IDS` (update after Phase 9 Step 1)

---

## Phase 4 — Bot Installation

```bash
cd /home/lerler/github/Agent_K_Telegram

# Install Node dependencies
npm install

# Create required directories
mkdir -p data workspace logs/activity logs/history
```

**Verify:** `npm install` completes without errors. `ls data workspace logs/` shows directories exist.

---

## Phase 5 — Code Change: OLLAMA_ONLY Mode

**Status: DONE** (applied 2026-03-11)

The following line was added to `src/claude-runner.js` inside `shouldUseOllama()` at line 96:

```javascript
if (process.env.OLLAMA_ONLY === 'true') return true;  // Force all tasks to Ollama
```

This bypasses Claude CLI entirely — no spawn errors when `claude` is not installed.

**To verify it's in place:**
```bash
grep -n "OLLAMA_ONLY" src/claude-runner.js
# Expected output: line 96 with the if statement above
```

If missing, add it manually: open `src/claude-runner.js`, find `shouldUseOllama()`, and insert
the line after `if (!ollamaAvailable) return false;`.

---

## Phase 6 — Configure .env

```bash
cd /home/lerler/github/Agent_K_Telegram
cp .env.example .env
```

Edit `.env` and set the following values:

```env
# --- Telegram ---
TELEGRAM_BOT_TOKEN=<token from @BotFather>
ALLOWED_TELEGRAM_IDS=<your Telegram user ID from @userinfobot>
ALLOWED_CHAT_IDS=<your chat ID — update after Phase 9 Step 1>

# --- Workspace ---
WORKSPACE_DIR=/home/lerler/github/Agent_K_Telegram/workspace

# --- Ollama (primary LLM — no Claude CLI needed) ---
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_DEFAULT=true
OLLAMA_ONLY=true
SHOW_MODEL_FOOTER=false

# --- Optional: Company info for invoice/contract skills ---
# COMPANY_NAME=Your Company
# COMPANY_EMAIL=you@gmail.com

# --- Optional: Gmail routing ---
# FROM_NAME=Your Name
# FROM_EMAIL=you@gmail.com
```

**Verify:** `cat .env | grep TELEGRAM_BOT_TOKEN` shows your token (not placeholder).

---

## Phase 7 — Gmail OAuth (Optional)

Skip this phase if you don't need `/check-email`, `/send-email`, or Google Sheets/Drive skills.

### 7a. Google Cloud Console

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "Agent K")
3. Enable APIs: Gmail API, Google Sheets API, Google Drive API
   - APIs & Services → Library → search each → Enable
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Desktop app**
   - Download the JSON file (save as `client_secret.json`)

### 7b. OAuth Consent Screen

- APIs & Services → OAuth consent screen → External
- App name: "Agent K", add your Gmail as a test user → Save

### 7c. Authenticate Gmail

```bash
python3 scripts/gmail-auth.py /path/to/client_secret.json
# Opens browser → sign in with new Gmail → grant permission
# Tokens saved to ~/.gmail-mcp/credentials.json
```

### 7d. Authenticate Google Drive/Sheets (optional)

```bash
python3 scripts/gdrive-auth.py /path/to/client_secret.json
```

**Verify:** `ls ~/.gmail-mcp/` shows `credentials.json`.

---

## Phase 8 — Start the Bot

### Development (auto-restart on file change):
```bash
cd /home/lerler/github/Agent_K_Telegram
npm run dev
```

### Production (background):
```bash
npm start
```

### Optional: systemd service (auto-start on boot)

Find your Node path first:
```bash
which node   # e.g. /home/lerler/.nvm/versions/node/v20.x.x/bin/node
```

Create the service file:
```bash
sudo nano /etc/systemd/system/agent-k.service
```

Paste (replace the `ExecStart` node path with actual path from `which node`):
```ini
[Unit]
Description=Agent K Telegram Bot
After=network.target ollama.service

[Service]
Type=simple
User=lerler
WorkingDirectory=/home/lerler/github/Agent_K_Telegram
ExecStart=/home/lerler/.nvm/versions/node/v20.x.x/bin/node src/index.js
EnvironmentFile=/home/lerler/github/Agent_K_Telegram/.env
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable agent-k
sudo systemctl start agent-k
sudo systemctl status agent-k   # should show: active (running)
```

---

## Phase 9 — Verification Checklist

Run these checks in order:

### Step 1 — Get your chat ID
- Send any message to your new Telegram bot
- Bot should reply with instructions or an error
- Send `/chatid` — bot replies with your chat ID
- Copy the chat ID into `.env` as `ALLOWED_CHAT_IDS=<id>`
- Restart the bot after updating `.env`

### Step 2 — Bot status
- Send `/status` to the bot
- Expected: shows bot health, session info, workspace path

### Step 3 — Ollama response
- Send `hello` to the bot
- Expected: Ollama model replies within 10–30 seconds
- Check logs: `tail -f logs/activity/$(date +%Y-%m-%d).log`

### Step 4 — Confirm Ollama routing
- Check the log for `[Ollama]` prefix (not `[Claude]`)
- Or send `/status` and look for the model name in the footer (if `SHOW_MODEL_FOOTER=true`)

### Step 5 — File workspace
- Send `/status` — workspace path should show
- Send `list files in workspace` — Ollama should respond without errors

### Step 6 — Gmail (if configured)
- Send `/check-email` in Telegram
- Expected: lists recent inbox messages

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bot doesn't respond | Check `ALLOWED_CHAT_IDS` and `ALLOWED_TELEGRAM_IDS` in `.env` |
| `ollama: command not found` | Re-run the Ollama install script; restart shell |
| Ollama model not found | Run `ollama pull llama3.2` then restart bot |
| `ECONNREFUSED localhost:11434` | Ollama service not running — `sudo systemctl start ollama` |
| `npm install` fails on native modules | `sudo apt install build-essential python3` then retry |
| Bot crashes on startup | Check `logs/activity/$(date +%Y-%m-%d).log` for error details |
| Claude CLI not found error | Confirm `OLLAMA_ONLY=true` is in `.env` and Phase 5 code change is present |
| Group messages ignored | Turn off Group Privacy in @BotFather → Bot Settings |

---

## Key File Locations

| File | Purpose |
|------|---------|
| `src/claude-runner.js` | Ollama routing logic — `shouldUseOllama()` at line ~94 |
| `src/ollama-runner.js` | Ollama HTTP client — sends requests to `localhost:11434` |
| `src/index.js` | Telegram bot entrypoint — Telegraf handlers |
| `.env` | All configuration — never commit this file |
| `data/bot.db` | SQLite database — sessions and audit log |
| `logs/activity/YYYY-MM-DD.log` | Daily activity log — check here for errors |
| `workspace/` | Claude/Ollama working directory for files |
