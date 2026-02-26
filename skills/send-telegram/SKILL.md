---
name: send-telegram
description: Send a message or file to Telegram via Agent K bot. Use when user asks to send something via Telegram.
---

Send a Telegram message or file using Agent K bot.

## Target
- Default: Group chat `$TELEGRAM_GROUP_CHAT_ID`
- Wei Khjan private: `$TELEGRAM_DM_CHAT_ID`
- Use group chat unless user specifies private

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
