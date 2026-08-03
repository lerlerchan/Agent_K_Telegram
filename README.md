# Staff-Bot

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen?logo=node.js)](https://nodejs.org)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram)](https://telegram.org)
[![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204.6-orange?logo=anthropic)](https://anthropic.com)
[![n8n](https://img.shields.io/badge/n8n-Orchestration-EA4B71?logo=n8n)](https://n8n.io)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-API-blue)](https://deepseek.com)
[![Obsidian](https://img.shields.io/badge/Obsidian-Vault-7C3AED?logo=obsidian)](https://obsidian.md)

Personal AI staff assistant — Telegram interface to Claude AI, with automatic note-saving to an Obsidian vault and a pre-compiled LLM wiki powered by DeepSeek and n8n.

## Architecture

![Staff-Bot System Architecture](docs/staff-bot-arch.png)

**K45VD (local server)** runs Staff-Bot alongside an Obsidian vault and wiki storage. **Claude AI** handles conversational reasoning. **n8n** on Hostinger orchestrates wiki ingestion and updates. **DeepSeek** pre-compiles vault notes into structured wiki articles for fast, embedding-free retrieval.

## Features

- **Conversational AI** — multi-turn chat via Claude Sonnet 4.6 with session continuity per user
- **Obsidian inbox** — forward URLs or text from Telegram; auto-saves to `00-inbox/` with YAML frontmatter and auto-tags (bazi, qimen, ai-tools, rag, macro-finance, etc.)
- **URL extraction** — paste a link and the bot fetches, strips, and saves the page content
- **LLM Wiki** — Karpathy-style pre-compiled wiki: each saved note becomes a structured article; query via natural language, no vector DB needed
- **Webhook integration** — new notes trigger n8n automatically to compile and index the wiki article
- **Authorization** — whitelist-based user access control
- **Session management** — per-user Claude CLI sessions with configurable timeouts

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Bot runtime | Node.js ≥ 20, Telegraf |
| AI reasoning | Claude Sonnet 4.6 (Anthropic API) |
| Note storage | Obsidian vault (markdown + frontmatter) |
| Wiki engine | n8n + DeepSeek (pre-compile, no embeddings) |
| Orchestration | n8n on Hostinger |
| Sync | Syncthing (K45VD ↔ Windows) |

## Setup

### Prerequisites

- Node.js ≥ 20
- A Telegram bot token ([BotFather](https://t.me/BotFather))
- Anthropic API key
- DeepSeek API key (for LLM wiki)
- n8n instance (self-hosted or Hostinger)

### Install

```bash
git clone https://github.com/lerlerchan/staff-bot.git
cd staff-bot
npm install
cp .env.example .env   # fill in your keys
```

### Environment Variables

```env
TELEGRAM_BOT_TOKEN=
ANTHROPIC_API_KEY=
AUTHORIZED_USER_IDS=123456789
TELEGRAM_GROUP_CHAT_ID=
OBSIDIAN_VAULT_PATH=~/ObsidianVault
WIKI_UPDATE_WEBHOOK=https://your-n8n/webhook/wiki-update
```

### LLM Wiki (n8n)

Import the three workflows from `~/ObsidianVault/outputs/`:

| Workflow | Purpose | Activate? |
|----------|---------|-----------|
| `llm-wiki-01-ingest.json` | Full vault compile (manual trigger) | No |
| `llm-wiki-02-update.json` | Single note update (webhook) | **Yes** |
| `llm-wiki-03-query.json` | Query interface (webhook) | **Yes** |

Create two n8n credentials:
- **SSH (Private Key)** named `K45VD SSH` — host: your server IP
- **Header Auth** named `DeepSeek API` — `Authorization: Bearer sk-xxx`

Run the full ingest once:

```bash
# In n8n: open workflow 01 → "Test workflow"
# Or query directly after:
curl -X POST https://your-n8n/webhook/wiki-query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is speculative decoding?"}'
```

### Run

```bash
npm start
# or with PM2:
pm2 start start.sh --name staff-bot
```

## Automation Scripts

`scripts/` holds standalone automation that shares this repo's vault and `.env`
but runs independently of the bot — most of it on cron (times are Asia/Kuala_Lumpur).

| Script | Schedule | What it does |
|--------|----------|--------------|
| `generate-tiktok.py` | Sun 12:03 | Batch-renders every `outputs/` post tagged `tiktok-ready` into a 1080×1920 MP4 (LLM script → TTS → word-level captions → slides → FFmpeg) and drops it in `TikTokQueue/` for review |
| `generate-wordpress-post.js` | Tue & Thu 10:00 | Drafts WordPress posts |
| `generate-finance-article.js` | Thu 01:00 | Drafts finance articles |
| `sync-linkedin-wiki.js` | Tue 16:00 | Syncs wiki content to LinkedIn |
| `vault-maintenance.js` | daily 19:00 | Vault housekeeping |
| `arrange-*.js` | weekly | Sorts inbox notes by topic (github / manga / metaphysics) |
| `arch-diagram/` | manual | Renders animated architecture-diagram videos (see below) |

### Animated architecture diagrams

`scripts/arch-diagram/` renders the sequential-reveal diagram videos common on
tech Reels — boxes fade in one at a time, arrows draw between them.

Plain CSS keyframes staggered by `animation-delay`; Playwright pauses every
animation and steps `currentTime` frame by frame via the Web Animations API, so
output is deterministic rather than a wall-clock screen capture.

```bash
python3 scripts/arch-diagram/render.py     # silent clip
```

For a voiced version, `add_voice.py` synthesises the narration (edge-tts, same
voice as the TikTok pipeline), measures each line, and prints the
`animation-delay` values the diagram should use — the narration drives the
timing, not the other way round. Full workflow is in `render.py`'s docstring.

Requires `playwright` (with Chromium), `edge-tts`, and `ffmpeg`.

## Usage

| Telegram command | What it does |
|-----------------|-------------|
| Send any message | Chat with Claude AI |
| Send a URL | Fetch, summarize, and save to Obsidian inbox |
| `/save <title>` | Save current message as a named note |
| `/notes` | List last 5 inbox notes |
| `/wiki <query>` | Query the pre-compiled LLM wiki |
| `/clear` | Reset Claude session |

## License

[GNU AGPL-3.0](LICENSE) © 2026 lerlerchan

Network copyleft: if you host this as a service, you must publish your modifications under the same license. See [LICENSE](LICENSE) for the additional permission clause covering Telegram Bot API, Claude API, and DeepSeek API integration.
