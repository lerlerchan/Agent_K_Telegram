require('dotenv').config();

const { Telegraf } = require('telegraf');
const { runClaude } = require('./claude-runner');
const { getSession, saveSession, logMessage } = require('./database');
const { isUserAllowed, splitMessage, markdownToHtml } = require('./utils');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

// Track users currently being processed to prevent duplicate spawns
const processingUsers = new Map(); // userId -> { startTime, messageId }

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

// Middleware: Auth check
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId || !isUserAllowed(userId)) {
    return ctx.reply('Unauthorized. Contact the bot owner for access.');
  }
  return next();
});

// Commands
bot.start((ctx) => ctx.reply(
  `Welcome to Agent K!\n\n` +
  `Commands:\n/new - New conversation\n/status - Bot status\n/test - Test CLI\n` +
  `/cancel - Cancel current request\n/cd <path> - Change workspace\n/sendfile <name> - Send file\n\nJust send a message!`
));

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
    if (elapsed > 300) {
      processingUsers.delete(userId);
      await ctx.reply('Previous request timed out. Processing your new message...');
    } else {
      await ctx.reply(`⏳ Still processing your previous request (${elapsed}s). Use /cancel to abort.`);
      return;
    }
  }

  const msg = await ctx.reply('🤔 Processing...');
  processingUsers.set(userId, { startTime: Date.now(), messageId: msg.message_id });

  setImmediate(async () => {
    try {
      const sessionId = await getSession(userId);
      const result = await runClaude(ctx.message.text, sessionId);

      if (result.sessionId) await saveSession(userId, result.sessionId);
      await logMessage(userId, ctx.message.text, result.response);
      await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
      await sendResponse(ctx.telegram, chatId, result.response, userId);
    } catch (e) {
      await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
      await ctx.telegram.sendMessage(chatId, `❌ Error: ${e.message}`);
    } finally {
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
    if (elapsed > 300) {
      processingUsers.delete(userId);
      await ctx.reply('Previous request timed out. Processing your new message...');
    } else {
      await ctx.reply(`⏳ Still processing your previous request (${elapsed}s). Use /cancel to abort.`);
      return;
    }
  }

  const msg = await ctx.reply('🤔 Processing...');
  processingUsers.set(userId, { startTime: Date.now(), messageId: msg.message_id });

  try {
    const link = await ctx.telegram.getFileLink(getFile(ctx));
    const dest = path.join(process.env.WORKSPACE_DIR, `upload_${Date.now()}${path.extname(link.href) || '.tmp'}`);
    await downloadFile(link.href, dest);

    const result = await runClaude(`${prompt}\n\nFile: ${dest}`);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    await sendResponse(ctx.telegram, chatId, result.response);
  } catch (e) {
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    await ctx.reply(`❌ ${e.message}`);
  } finally {
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
bot.catch((err, ctx) => ctx.reply('An error occurred. Please try again.'));

// Start server
(async () => {
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
    await bot.launch();
    console.log(`🤖 Polling mode | Workspace: ${process.env.WORKSPACE_DIR}`);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
