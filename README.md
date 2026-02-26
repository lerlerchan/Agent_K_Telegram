# Tele Agent K

Telegram bot that interfaces with Claude Code CLI, giving you full Claude Code capabilities via Telegram.

## Features

- Full Claude Code tool access (Read, Write, Edit, Bash, Playwright, etc.)
- Conversation continuity with session persistence
- User whitelist authentication
- File sharing (images and documents) via Telegram
- Audit logging with SQLite
- Webhook and polling mode support
- Microsoft Office file handling (Excel, Word, PowerPoint)

## Architecture

```
Telegram User
     │
     ▼
┌─────────────────────────────────────┐
│         Tele Agent K Bot            │
│  ┌─────────────────────────────┐    │
│  │   Telegraf (Bot Framework)  │    │
│  └─────────────────────────────┘    │
│              │                      │
│  ┌───────────┴───────────┐          │
│  ▼                       ▼          │
│ Auth                  Express       │
│ Middleware            (Webhook)     │
│  │                                  │
│  ▼                                  │
│ Claude Runner ──► Claude Code CLI   │
│  │               (--dangerously-    │
│  │                skip-permissions) │
│  ▼                                  │
│ SQLite DB                           │
│ (sessions + audit)                  │
└─────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and command list |
| `/new` | Clear session, start new conversation |
| `/status` | Check bot status, session, and workspace |
| `/cd <path>` | Change workspace directory |
| `/sendfile <name>` | Send a file from workspace |
| `/test` | Test Claude CLI availability |

## Special Response Tags

Claude can send files to users by including these tags in responses:

```
[SEND_IMAGE: screenshot.png]   # Sends as photo
[SEND_FILE: document.pdf]      # Sends as document
```

---

## Setup Guide

### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat and send `/newbot`
3. Follow the prompts:
   - Enter a **name** for your bot (e.g., "My Agent K")
   - Enter a **username** (must end with `bot`, e.g., `my_agent_k_bot`)
4. BotFather will reply with your **Bot Token**:
   ```
   Use this token to access the HTTP API:
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
5. **Save this token** - you'll need it for `TELEGRAM_BOT_TOKEN`

#### Optional: Configure Bot Settings

Send these commands to @BotFather:
```
/setdescription - Set bot description
/setabouttext - Set "About" text
/setuserpic - Set bot profile picture
/setcommands - Set command menu:
  start - Welcome message
  new - Start new conversation
  status - Check bot status
  test - Test Claude CLI
```

### Step 2: Get Your Telegram User ID

1. Search for **@userinfobot** on Telegram
2. Start a chat - it will reply with your info:
   ```
   Your user ID: 123456789
   ```
3. **Save this ID** - add it to `ALLOWED_TELEGRAM_IDS`

### Step 3: Get Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to **API Keys** section
4. Click **Create Key**
5. Give it a name (e.g., "Tele Agent K")
6. **Copy and save the key** - it starts with `sk-ant-`

### Step 4: Install Claude Code CLI

```bash
# Install globally via npm
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version

# Authenticate (one-time)
claude auth
```

### Step 5: Configure Environment

```bash
# Copy example config
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ANTHROPIC_API_KEY=sk-ant-your-key-here
ALLOWED_TELEGRAM_IDS=123456789

# Optional - Multiple users (comma-separated)
ALLOWED_TELEGRAM_IDS=123456789,987654321,555555555

# Optional - Working directory
WORKSPACE_DIR=./workspace

# Optional - Webhook URL (for production)
WEBHOOK_URL=https://your-domain.com/webhook
```

### Step 6: Install and Run

```bash
# Install dependencies
npm install

# Install Playwright browsers (for web automation)
npx playwright install chromium

# Run in development mode (with auto-reload)
npm run dev

# Or run in production mode
npm start
```

---

## Deployment Options

### Option A: Local with Polling (Simplest)

No webhook needed - bot polls Telegram for updates.

```bash
# Just run without WEBHOOK_URL set
npm start
```

### Option B: Cloudflare Tunnel (Recommended for Desktop)

Expose your local machine to the internet securely without port forwarding.

#### Install Cloudflared

**Windows:**
```powershell
# Using winget
winget install Cloudflare.cloudflared

# Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

**macOS:**
```bash
brew install cloudflared
```

**Linux:**
```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Or use the binary
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

#### Quick Tunnel (No Cloudflare Account Needed)

```bash
# Start the bot first
npm start

# In another terminal, create a quick tunnel
cloudflared tunnel --url http://localhost:3000
```

Output will show:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

Update your `.env`:
```env
WEBHOOK_URL=https://random-words-here.trycloudflare.com/webhook
```

Restart the bot to apply the webhook.

#### Persistent Tunnel (With Cloudflare Account)

1. **Login to Cloudflare:**
   ```bash
   cloudflared tunnel login
   ```
   This opens a browser - select your domain.

2. **Create a named tunnel:**
   ```bash
   cloudflared tunnel create tele-agent-k
   ```
   Save the tunnel ID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

3. **Create config file** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   credentials-file: ~/.cloudflared/a1b2c3d4-e5f6-7890-abcd-ef1234567890.json

   ingress:
     - hostname: agent-k.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Create DNS record:**
   ```bash
   cloudflared tunnel route dns tele-agent-k agent-k.yourdomain.com
   ```

5. **Run the tunnel:**
   ```bash
   # Foreground
   cloudflared tunnel run tele-agent-k

   # Or install as service (Windows)
   cloudflared service install

   # Or install as service (Linux/macOS)
   sudo cloudflared service install
   ```

6. **Update `.env`:**
   ```env
   WEBHOOK_URL=https://agent-k.yourdomain.com/webhook
   ```

### Option C: Deploy with Docker

```bash
docker build -t tele-agent-k .
docker run -d \
  --name tele-agent-k \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e ANTHROPIC_API_KEY=your_key \
  -e ALLOWED_TELEGRAM_IDS=123456789 \
  -v $(pwd)/workspace:/app/workspace \
  -v $(pwd)/data:/app/data \
  tele-agent-k
```

### Option D: Deploy to Zeabur

1. Push code to GitHub
2. Go to [zeabur.com](https://zeabur.com) and connect your repo
3. Add environment variables in Zeabur dashboard
4. Deploy - Zeabur provides a URL automatically
5. Set `WEBHOOK_URL` to `https://your-zeabur-url.zeabur.app/webhook`

---

## Project Structure

```
tele-agent-k/
├── src/
│   ├── index.js         # Main bot entry, commands, handlers
│   ├── claude-runner.js # Claude Code CLI wrapper
│   ├── database.js      # SQLite session & audit logging
│   └── utils.js         # Auth, message splitting, markdown
├── workspace/           # Claude's working directory
│   └── CLAUDE.md        # Context instructions for Claude
├── data/                # SQLite database storage
├── Dockerfile           # Container config with Playwright
├── package.json
└── .env.example
```

## Database Schema

SQLite database (`data/bot.db`) with two tables:

**sessions** - Conversation continuity
- `telegram_user_id` (PRIMARY KEY)
- `session_id` - Claude Code session ID
- `updated_at`

**audit_log** - Message history
- `id`, `telegram_user_id`
- `user_message`, `bot_response`
- `created_at`

## Security

- **Whitelist Authentication**: Only Telegram IDs in `ALLOWED_TELEGRAM_IDS` can use the bot. If unconfigured, all users are denied.
- **Permissions Bypass**: `--dangerously-skip-permissions` flag is enabled, giving Claude full system access within the workspace.
- **Audit Logging**: All messages are logged for review.

### Security Considerations

- Keep your `.env` file secure and never commit it
- Regularly review audit logs
- Limit `ALLOWED_TELEGRAM_IDS` to trusted users only
- Consider running in a containerized environment
- Use Cloudflare Tunnel instead of exposing ports directly

## Troubleshooting

### Bot not responding
- Check `TELEGRAM_BOT_TOKEN` is correct
- Verify your user ID is in `ALLOWED_TELEGRAM_IDS`
- Check Claude CLI is installed: `claude --version`

### Webhook not working
- Ensure `WEBHOOK_URL` ends with `/webhook`
- Check tunnel is running: `cloudflared tunnel list`
- Telegram requires HTTPS - tunnels provide this automatically

### Claude CLI errors
- Run `claude auth` to re-authenticate
- Check `ANTHROPIC_API_KEY` is valid
- Verify API quota at console.anthropic.com

## Dependencies

| Package | Purpose |
|---------|---------|
| telegraf | Telegram bot framework |
| express | Webhook server |
| better-sqlite3 | Local database |
| dotenv | Environment config |
| playwright | Browser automation |

## Requirements

- Node.js >= 20.0.0
- Claude Code CLI (`@anthropic-ai/claude-code`)
- Anthropic API key
- (Optional) Cloudflared for tunneling

## License

MIT
