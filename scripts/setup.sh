#!/bin/bash
# setup.sh — First-run interactive setup for Agent K Telegram Bot
# Idempotent: safe to run multiple times.

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo ""
echo "========================================="
echo "  Agent K Telegram Bot — Setup"
echo "========================================="
echo ""

# ── 1. npm install ──
if [ ! -d "node_modules" ]; then
  echo "[1/6] Installing Node.js dependencies..."
  npm install
else
  echo "[1/6] Dependencies already installed."
fi

# ── 2. Skills symlink ──
echo ""
echo "[2/6] Setting up skills..."
bash scripts/setup-skills.sh

# ── 3. Environment variables ──
echo ""
echo "[3/6] Configuring environment..."

if [ "$1" = "--reconfigure" ]; then
  echo "  Reconfiguring .env..."
  CONFIGURE_ENV=true
elif [ -f ".env" ]; then
  echo "  Found existing .env — skipping env setup."
  echo "  Run with --reconfigure to redo."
  CONFIGURE_ENV=false
else
  CONFIGURE_ENV=true
fi

if [ "$CONFIGURE_ENV" = true ]; then
  cp -n .env.example .env 2>/dev/null || true

  echo ""
  echo "  --- MANDATORY (bot won't start without these) ---"
  echo ""

  read -rp "  Telegram bot token (from @BotFather): " BOT_TOKEN
  if [ -z "$BOT_TOKEN" ]; then
    echo "  ERROR: Bot token is required. Get one from @BotFather on Telegram."
    exit 1
  fi
  sed -i.bak "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$BOT_TOKEN|" .env

  read -rp "  Allowed chat IDs (comma-separated, use /chatid to find): " CHAT_IDS
  if [ -z "$CHAT_IDS" ]; then
    echo "  ERROR: At least one chat ID is required for security."
    exit 1
  fi
  sed -i.bak "s|^ALLOWED_CHAT_IDS=.*|ALLOWED_CHAT_IDS=$CHAT_IDS|" .env

  echo ""
  echo "  --- RECOMMENDED (press Enter to use defaults) ---"
  echo ""

  read -rp "  Working directory [default: ~/]: " WORKSPACE
  WORKSPACE="${WORKSPACE:-$HOME}"
  sed -i.bak "s|^WORKSPACE_DIR=.*|WORKSPACE_DIR=$WORKSPACE|" .env

  read -rp "  Company name: " CO_NAME
  [ -n "$CO_NAME" ] && sed -i.bak "s|^COMPANY_NAME=.*|COMPANY_NAME=$CO_NAME|" .env

  read -rp "  Company email: " CO_EMAIL
  [ -n "$CO_EMAIL" ] && sed -i.bak "s|^COMPANY_EMAIL=.*|COMPANY_EMAIL=$CO_EMAIL|" .env

  read -rp "  Contact person name: " CO_CONTACT
  [ -n "$CO_CONTACT" ] && sed -i.bak "s|^COMPANY_CONTACT_NAME=.*|COMPANY_CONTACT_NAME=$CO_CONTACT|" .env

  read -rp "  Contact person title [default: Director]: " CO_TITLE
  CO_TITLE="${CO_TITLE:-Director}"
  sed -i.bak "s|^COMPANY_CONTACT_TITLE=.*|COMPANY_CONTACT_TITLE=$CO_TITLE|" .env

  read -rp "  Company address (without country): " CO_ADDR
  [ -n "$CO_ADDR" ] && sed -i.bak "s|^COMPANY_ADDRESS=.*|COMPANY_ADDRESS=$CO_ADDR|" .env

  read -rp "  Company registration number: " CO_REG
  [ -n "$CO_REG" ] && sed -i.bak "s|^COMPANY_REG=.*|COMPANY_REG=$CO_REG|" .env

  read -rp "  Email display name [default: same as contact]: " FROM_NAME
  [ -n "$FROM_NAME" ] && sed -i.bak "s|^FROM_NAME=.*|FROM_NAME=$FROM_NAME|" .env

  read -rp "  Email address for sending [default: same as company email]: " FROM_EMAIL
  [ -n "$FROM_EMAIL" ] && sed -i.bak "s|^FROM_EMAIL=.*|FROM_EMAIL=$FROM_EMAIL|" .env

  read -rp "  Telegram group chat ID for file delivery: " TG_GROUP
  [ -n "$TG_GROUP" ] && sed -i.bak "s|^TELEGRAM_GROUP_CHAT_ID=.*|TELEGRAM_GROUP_CHAT_ID=$TG_GROUP|" .env

  read -rp "  Telegram DM chat ID for private delivery: " TG_DM
  [ -n "$TG_DM" ] && sed -i.bak "s|^TELEGRAM_DM_CHAT_ID=.*|TELEGRAM_DM_CHAT_ID=$TG_DM|" .env

  echo ""
  echo "  Optional vars you can edit in .env later:"
  echo "    ALLOWED_TELEGRAM_IDS, COMPANY_SST_NO, BANK_NAME, BANK_ACCT_NAME,"
  echo "    BANK_ACCT_NO, CC_EMAILS, PLAYWRIGHT_CHROME_PATH"

  # Clean up sed backup files
  rm -f .env.bak
fi

# ── 4. Gmail auth ──
echo ""
echo "[4/6] Gmail setup"

if [ "$1" = "--gmail" ] || [ ! -f "$HOME/.gmail-mcp/credentials.json" ]; then
  echo ""
  echo "  We recommend creating a NEW Gmail account dedicated to your agent."
  echo "  This keeps personal email separate and allows full API control."
  echo ""
  echo "  Steps to set up Gmail API access:"
  echo "    1. Create a new Gmail account for your agent (e.g. your-agent@gmail.com)"
  echo "    2. Go to console.cloud.google.com and create a new project"
  echo "    3. Enable the Gmail API (APIs & Services > Library > Gmail API)"
  echo "    4. Create OAuth 2.0 credentials:"
  echo "       - APIs & Services > Credentials > Create Credentials > OAuth Client ID"
  echo "       - Application type: Desktop app"
  echo "       - Download the JSON file"
  echo "    5. Add your agent's Gmail as a test user:"
  echo "       - OAuth consent screen > Test users > Add your agent email"
  echo ""
  read -rp "  Path to downloaded OAuth client JSON (or Enter to skip): " OAUTH_PATH

  if [ -n "$OAUTH_PATH" ] && [ -f "$OAUTH_PATH" ]; then
    echo "  Running Gmail OAuth flow..."
    python3 "$REPO_DIR/scripts/gmail-auth.py" "$OAUTH_PATH"
  else
    echo "  Skipped. Gmail sending disabled."
    echo "  Run ./scripts/setup.sh --gmail later to set up."
  fi
else
  echo "  Gmail credentials found. Skipping."
fi

# ── 5. Check Claude CLI ──
echo ""
echo "[5/6] Checking prerequisites..."

if command -v claude &>/dev/null; then
  CLAUDE_VER=$(claude --version 2>/dev/null || echo "unknown")
  echo "  Claude CLI: $CLAUDE_VER"
else
  echo "  WARNING: Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
fi

# ── 6. Playwright ──
if npx playwright --version &>/dev/null 2>&1; then
  echo "  Playwright: installed"
else
  echo "  Installing Playwright chromium..."
  npx playwright install chromium
fi

# ── Done ──
echo ""
echo "========================================="
echo "  Setup complete!"
echo ""
echo "  Start the bot:  npm start"
echo "  Dev mode:        npm run dev"
echo "========================================="
echo ""
