---
name: send-file
description: Generate and deliver a file to the user. Delivery is context-aware — send to wherever the user engaged from (group→group, DM→DM). Use when user requests a document, report, or any file output.
---

Generate and deliver a file to the user.

## Delivery Rules (context-aware)
Determine WHERE the user is asking from, then deliver accordingly:

| Context | Destination |
|---------|------------|
| User asks via **Telegram group** | Send to group `$TELEGRAM_GROUP_CHAT_ID` |
| User asks via **Telegram DM** | Send to DM `$TELEGRAM_DM_CHAT_ID` |
| User asks via **Claude Code / terminal** | Send to DM `$TELEGRAM_DM_CHAT_ID` (same as DM) |
| User says "email" | Send via Gmail MCP |
| User says "here" or "in chat" | Return file path / content inline |

## Telegram Delivery Scripts

### Group chat
```bash
cd ~/Agent_K_Telegram && node -e "
const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.telegram.sendDocument(process.env.TELEGRAM_GROUP_CHAT_ID, { source: 'FILE_PATH' }, { caption: 'CAPTION' })
  .then(() => { console.log('Sent'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

### DM (Wei Khjan)
```bash
cd ~/Agent_K_Telegram && node -e "
const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.telegram.sendDocument(process.env.TELEGRAM_DM_CHAT_ID, { source: 'FILE_PATH' }, { caption: 'CAPTION' })
  .then(() => { console.log('Sent'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

## Arguments
- `$ARGUMENTS` = file path or description of file to generate and send
