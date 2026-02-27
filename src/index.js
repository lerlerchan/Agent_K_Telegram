require('dotenv').config();

// Validate required env vars
const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}. Copy .env.example to .env and configure.`);
    process.exit(1);
  }
}

const { Telegraf } = require('telegraf');
const { runClaude } = require('./claude-runner');
const { getSession, saveSession, logMessage } = require('./database');
const { isUserAllowed, splitMessage, markdownToHtml } = require('./utils');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://api.telegram.org',
    agent: new (require('https').Agent)({ keepAlive: true, timeout: 120000 }),
    webhookReply: false,
  },
  handlerTimeout: 600_000, // 10 min for long Claude responses
});
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

// Track users currently being processed to prevent duplicate spawns
const processingUsers = new Map(); // userId -> { startTime, messageId, abort }

// Helper: Resolve file path relative to workspace
const resolvePath = (filePath) => {
  if (!filePath) return null;
  let resolved = filePath.trim();
  if (!path.isAbsolute(resolved)) {
    resolved = path.join(process.env.WORKSPACE_DIR, resolved);
  }
  return resolved.replace(/\//g, path.sep);
};

// Helper: Extract files from [SEND_IMAGE:] and [SEND_FILE:] tags
const findFilesToSend = (response) => {
  const images = [], files = [];
  const extract = (pattern, arr) => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      const filePath = resolvePath(match[1]);
      if (filePath && fs.existsSync(filePath) && !arr.includes(filePath)) {
        arr.push(filePath);
      }
    }
  };
  extract(/\[SEND_IMAGE:\s*([^\]]+)\]/gi, images);
  extract(/\[SEND_FILE:\s*([^\]]+)\]/gi, files);
  return { images, files };
};

// Helper: Download file from URL
const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  https.get(url, (res) => {
    res.pipe(file);
    file.on('finish', () => { file.close(); resolve(); });
  }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
});

// Helper: Send response with files
const sendResponse = async (telegram, chatId, response, userId) => {
  const { images, files } = findFilesToSend(response);
  const clean = response.replace(/\[SEND_(IMAGE|FILE):\s*[^\]]+\]/gi, '').trim();

  // Send text
  for (const chunk of splitMessage(markdownToHtml(clean))) {
    try {
      await telegram.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
    } catch {
      await telegram.sendMessage(chatId, clean.slice(0, 4000));
      break;
    }
  }

  // Send images & files
  for (const p of images) {
    await telegram.sendPhoto(chatId, { source: p }, { caption: path.basename(p) }).catch(() => {});
  }
  for (const p of files) {
    await telegram.sendDocument(chatId, { source: p }, { caption: path.basename(p) }).catch(() => {});
  }
};

// Middleware: Only respond in allowed chats. Ignore everything else.
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;

  // Only respond in allowed chats (from ALLOWED_CHAT_IDS env var)
  const allowedChats = (process.env.ALLOWED_CHAT_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  if (allowedChats.length === 0) return next(); // no restriction if unset
  if (!allowedChats.includes(String(chatId))) {
    console.log(`[${new Date().toLocaleTimeString()}] ⛔ Ignored chat ${chatId} (${chatType}) from ${ctx.from?.username || ctx.from?.id}`);
    return;
  }

  // In private/DM chats — process all messages directly (no mention needed)
  if (chatType === 'private') return next();

  // In groups/supergroups, only respond if bot is mentioned or replied to
  if (chatType === 'group' || chatType === 'supergroup') {
    const text = ctx.message?.text || ctx.message?.caption || '';
    const botInfo = await ctx.telegram.getMe();
    const botUsername = botInfo.username;

    const isMentioned = text.includes(`@${botUsername}`);
    const isReplyToBot = ctx.message?.reply_to_message?.from?.id === botInfo.id;

    if (!isMentioned && !isReplyToBot) return;

    console.log(`[${new Date().toLocaleTimeString()}] 📩 ${ctx.from?.username || ctx.from?.id}: ${(ctx.message?.text || ctx.message?.caption || '').slice(0, 80)}`);

    // Strip the @botusername from the message before processing
    if (ctx.message?.text) {
      ctx.message.text = ctx.message.text.replace(new RegExp(`@${botUsername}`, 'g'), '').trim();
    }

    // Prepend replied-to message content so Claude has full context
    if (isReplyToBot && ctx.message?.reply_to_message?.text) {
      const quoted = ctx.message.reply_to_message.text.slice(0, 500);
      ctx.message.text = `[Replying to your message: "${quoted}"]\n\n${ctx.message.text}`;
    }

    return next();
  }
});

// Commands
bot.start((ctx) => ctx.reply(
  `Welcome to Agent K!\n\n` +
  `Commands:\n/new - New conversation\n/status - Bot status\n/test - Test CLI\n` +
  `/cancel - Cancel current request\n/cd <path> - Change workspace\n/sendfile <name> - Send file\n\nJust send a message!`
));

bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

bot.command('new', async (ctx) => {
  await saveSession(ctx.from.id.toString(), null);
  ctx.reply('New conversation started.');
});

bot.command('status', async (ctx) => {
  const session = await getSession(ctx.from.id.toString());
  ctx.reply(`Status: ✅ Online\nSession: ${session ? 'Active' : 'None'}\nWorkspace: ${process.env.WORKSPACE_DIR}`);
});

bot.command('cd', (ctx) => {
  const newPath = ctx.message.text.slice(4).trim();
  if (!newPath) return ctx.reply(`Workspace: ${process.env.WORKSPACE_DIR}`);
  if (fs.existsSync(newPath)) {
    process.env.WORKSPACE_DIR = newPath;
    ctx.reply(`✅ Changed to: ${newPath}`);
  } else {
    ctx.reply(`❌ Path not found`);
  }
});

bot.command('test', (ctx) => {
  try {
    const { execSync } = require('child_process');
    const ver = execSync('claude --version', { encoding: 'utf8', shell: true, timeout: 10000 });
    ctx.reply(`Claude CLI: ✅ ${ver.trim()}`);
  } catch (e) {
    ctx.reply(`Claude CLI: ❌ ${e.message}`);
  }
});

bot.command('cancel', async (ctx) => {
  const userId = ctx.from.id.toString();
  if (processingUsers.has(userId)) {
    const info = processingUsers.get(userId);
    if (info.abort) info.abort.abort(); // kill the Claude process
    processingUsers.delete(userId);
    ctx.reply('🛑 Request cancelled. You can send a new message now.');
  } else {
    ctx.reply('No active request to cancel.');
  }
});

bot.command('sendfile', async (ctx) => {
  const file = ctx.message.text.slice(10).trim();
  if (!file) return ctx.reply('Usage: /sendfile <filename>');

  const fullPath = resolvePath(file);
  if (!fs.existsSync(fullPath)) return ctx.reply(`❌ File not found`);

  const ext = path.extname(fullPath).toLowerCase();
  try {
    if (IMAGE_EXTS.includes(ext)) {
      await ctx.replyWithPhoto({ source: fullPath });
    } else {
      await ctx.replyWithDocument({ source: fullPath });
    }
  } catch (e) {
    ctx.reply(`❌ ${e.message}`);
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  // Check if already processing for this user
  if (processingUsers.has(userId)) {
    const info = processingUsers.get(userId);
    const elapsed = Math.round((Date.now() - info.startTime) / 1000);
    // Auto-clear stale locks after 5 minutes
    if (elapsed > 1800) {
      processingUsers.delete(userId);
      await ctx.reply('Previous request timed out. Processing your new message...');
    } else {
      await ctx.reply(`⏳ Still processing your previous request (${elapsed}s). Use /cancel to abort.`);
      return;
    }
  }

  console.log(`[${new Date().toLocaleTimeString()}] ⚙️  Processing for ${ctx.from?.username || userId}...`);
  const msg = await ctx.reply('🤔 Processing...');
  const abort = new AbortController();
  let lastStatus = 'Thinking...';
  processingUsers.set(userId, { startTime: Date.now(), messageId: msg.message_id, abort });

  const onProgress = (status) => {
    if (status) lastStatus = status;
  };

  // Progress: update message with elapsed time + status every 30s
  const progressInterval = setInterval(async () => {
    const info = processingUsers.get(userId);
    if (!info) return clearInterval(progressInterval);
    const elapsed = Math.round((Date.now() - info.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    await ctx.telegram.editMessageText(chatId, msg.message_id, null,
      `🤔 ${lastStatus} (${mins}m ${secs}s)\n/cancel to abort`
    ).catch(() => {});
  }, 30000);

  setImmediate(async () => {
    const startTime = Date.now();
    try {
      const sessionId = await getSession(userId);

      // Build prompt — include reply context if user replied to a bot message
      let prompt = ctx.message.text;
      const replied = ctx.message.reply_to_message;
      if (replied?.from?.id === (await ctx.telegram.getMe()).id && replied?.text) {
        const quoted = replied.text.slice(0, 500);
        prompt = `[Replying to your message: "${quoted}"]\n\n${prompt}`;
      }

      const result = await runClaude(prompt, sessionId, { onProgress, signal: abort.signal });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Reply to ${ctx.from?.username || userId} (${elapsed}s, ${result.response.length} chars)`);

      if (result.sessionId) await saveSession(userId, result.sessionId);
      await logMessage(userId, prompt, result.response);
      await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
      await sendResponse(ctx.telegram, chatId, result.response, userId);
    } catch (e) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${new Date().toLocaleTimeString()}] ❌ Error for ${ctx.from?.username || userId} (${elapsed}s): ${e.message}`);
      await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
      if (e.message !== 'Request cancelled') {
        await ctx.telegram.sendMessage(chatId, `❌ Error: ${e.message}`);
      }
    } finally {
      clearInterval(progressInterval);
      processingUsers.delete(userId);
    }
  });
});

// Handle photos & documents
const handleMedia = async (ctx, getFile, prompt) => {
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  // Check if already processing for this user
  if (processingUsers.has(userId)) {
    const info = processingUsers.get(userId);
    const elapsed = Math.round((Date.now() - info.startTime) / 1000);
    // Auto-clear stale locks after 5 minutes
    if (elapsed > 1800) {
      processingUsers.delete(userId);
      await ctx.reply('Previous request timed out. Processing your new message...');
    } else {
      await ctx.reply(`⏳ Still processing your previous request (${elapsed}s). Use /cancel to abort.`);
      return;
    }
  }

  const msg = await ctx.reply('🤔 Processing...');
  const abort = new AbortController();
  let lastStatus = 'Thinking...';
  processingUsers.set(userId, { startTime: Date.now(), messageId: msg.message_id, abort });

  const onProgress = (status) => {
    if (status) lastStatus = status;
  };

  const progressInterval = setInterval(async () => {
    const info = processingUsers.get(userId);
    if (!info) return clearInterval(progressInterval);
    const elapsed = Math.round((Date.now() - info.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    await ctx.telegram.editMessageText(chatId, msg.message_id, null,
      `🤔 ${lastStatus} (${mins}m ${secs}s)\n/cancel to abort`
    ).catch(() => {});
  }, 30000);

  const startTime = Date.now();
  console.log(`[${new Date().toLocaleTimeString()}] 📎 Media from ${ctx.from?.username || userId}: ${prompt.slice(0, 60)}`);
  try {
    const link = await ctx.telegram.getFileLink(getFile(ctx));
    const dest = path.join(process.env.WORKSPACE_DIR, `upload_${Date.now()}${path.extname(link.href) || '.tmp'}`);
    await downloadFile(link.href, dest);

    const result = await runClaude(`${prompt}\n\nFile: ${dest}`, null, { onProgress, signal: abort.signal });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Media reply to ${ctx.from?.username || userId} (${elapsed}s)`);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    await sendResponse(ctx.telegram, chatId, result.response);
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Media error for ${ctx.from?.username || userId} (${elapsed}s): ${e.message}`);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    if (e.message !== 'Request cancelled') {
      await ctx.reply(`❌ ${e.message}`);
    }
  } finally {
    clearInterval(progressInterval);
    processingUsers.delete(userId);
  }
};

bot.on('photo', (ctx) => handleMedia(ctx,
  (c) => c.message.photo[c.message.photo.length - 1].file_id,
  ctx.message.caption || 'Analyze this image'
));

bot.on('document', (ctx) => handleMedia(ctx,
  (c) => c.message.document.file_id,
  ctx.message.caption || `Process: ${ctx.message.document.file_name}`
));

// Error handling
bot.catch((err, ctx) => {
  console.error(`[${new Date().toISOString()}] Bot middleware error:`, err.message);
  ctx.reply('An error occurred. Please try again.').catch(() => {});
});

// Auto-restart polling on crash
async function startBot() {
  const webhookUrl = process.env.WEBHOOK_URL;

  if (webhookUrl && !webhookUrl.includes('your-subdomain')) {
    const app = express();
    app.use(express.json());
    app.get('/', (_, res) => res.send('Tele Agent K running!'));
    app.use(bot.webhookCallback('/webhook'));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, async () => {
      console.log(`🤖 Server on port ${PORT} | Workspace: ${process.env.WORKSPACE_DIR}`);
      setTimeout(async () => {
        try {
          await bot.telegram.setWebhook(webhookUrl);
          console.log(`✅ Webhook: ${webhookUrl}`);
        } catch {
          console.log('Falling back to polling...');
          bot.launch();
        }
      }, 2000);
    });
  } else {
    console.log(`🤖 Starting Agent K in polling mode | Workspace: ${process.env.WORKSPACE_DIR}`);
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query'],
      polling: { timeout: 60 },  // long-poll 60s (default 30s)
    });
  }
}

// Global error handlers — prevent crash on network timeouts
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception: ${err.message}`);
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EAI_AGAIN') {
    console.log('⚡ Network error detected, restarting bot in 5s...');
    bot.stop('restart').catch(() => {});
    setTimeout(() => startBot().catch(console.error), 5000);
  } else {
    console.error('💀 Fatal error, exiting...');
    process.exit(1);
  }
});

process.on('unhandledRejection', (err) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, err?.message || err);
});

startBot().catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
