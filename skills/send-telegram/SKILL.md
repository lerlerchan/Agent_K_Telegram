---
name: send-telegram
description: Send a message or file to Telegram via Agent K bot. Use when user asks to send something via Telegram.
---

Send a Telegram message or file using Agent K bot.

## Target (context-aware — reply where the user engaged)
| Context | Destination |
|---------|------------|
| User messaged from **Telegram group** | Send to group `$TELEGRAM_GROUP_CHAT_ID` |
| User messaged from **Telegram DM** | Send to DM `$TELEGRAM_DM_CHAT_ID` |
| Called from **Claude Code / terminal** | Send to DM `$TELEGRAM_DM_CHAT_ID` |
| User specifies a target explicitly | Use that target |

## How to Send

Run a Node.js script using the bot token from `~/Agent_K_Telegram/.env`:

```js
const { Telegraf } = require('telegraf');
require('dotenv').config({ path: '/Users/aitraining2u/Agent_K_Telegram/.env' });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
```

### Text Message
```js
bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
```

### File
```js
bot.telegram.sendDocument(chatId, { source: filePath }, { caption: 'description' });
```

### Image
```js
bot.telegram.sendPhoto(chatId, { source: filePath }, { caption: 'description' });
```

## Arguments
- `$ARGUMENTS` = message text, file path, or description of what to send
- If a file path is given, send as document
- If text is given, send as message
