require('dotenv').config();

// Validate required env vars
const REQUIRED_ENV = ['TELEGRAM_BOT_TOKEN'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}. Copy .env.example to .env and configure.`);
    process.exit(1);
  }
}

// ── Security checks at startup ────────────────────────────────────────────────
(function runSecurityChecks() {
  const { execSync, spawnSync } = require('child_process');
  const fs = require('fs'), path = require('path');
  const WARN = (msg) => console.warn(`[SECURITY ⚠️ ] ${msg}`);
  const OK   = (msg) => console.log(`[SECURITY ✅] ${msg}`);

  // 1. ALLOWED_TELEGRAM_IDS must be set in production
  const ids = (process.env.ALLOWED_TELEGRAM_IDS || '').trim();
  if (!ids) {
    WARN('ALLOWED_TELEGRAM_IDS is not set — bot will respond to ANY Telegram user!');
    WARN('Set ALLOWED_TELEGRAM_IDS=your_telegram_id in .env to restrict access.');
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY ❌] Refusing to start in production without ALLOWED_TELEGRAM_IDS. Set it in .env.');
      process.exit(1);
    }
  } else {
    OK(`ALLOWED_TELEGRAM_IDS set (${ids.split(',').length} user(s) whitelisted)`);
  }

  // 2. .env file permissions — warn if readable by group or others
  const envPath = path.resolve(__dirname, '..', '.env');
  try {
    const stat = fs.statSync(envPath);
    const mode = stat.mode & 0o777;
    if (mode & 0o077) {
      WARN(`.env is world/group readable (mode ${mode.toString(8)}). Run: chmod 600 .env`);
    } else {
      OK('.env permissions are secure (600)');
    }
  } catch { /* .env not found — dotenv will have already warned */ }

  // 3. Token rotation age — warn if TOKEN_ROTATED_AT is old or unset
  const rotatedAt = process.env.TOKEN_ROTATED_AT;
  if (!rotatedAt) {
    WARN('TOKEN_ROTATED_AT not set in .env. Add it (e.g. TOKEN_ROTATED_AT=2026-03-30) to track rotation age.');
  } else {
    const days = Math.floor((Date.now() - new Date(rotatedAt).getTime()) / 86400000);
    if (days > 90) {
      WARN(`Telegram bot token is ${days} days old (last rotated: ${rotatedAt}). Consider rotating via @BotFather.`);
    } else {
      OK(`Token rotation age: ${days} day(s) (rotated: ${rotatedAt})`);
    }
  }

  // 4. npm audit — run weekly in background, log results
  const auditFlagFile = path.resolve(__dirname, '..', 'logs', '.last-npm-audit');
  const AUDIT_INTERVAL_DAYS = 7;
  let runAudit = true;
  try {
    const last = fs.readFileSync(auditFlagFile, 'utf8').trim();
    const daysSince = (Date.now() - new Date(last).getTime()) / 86400000;
    if (daysSince < AUDIT_INTERVAL_DAYS) {
      OK(`npm audit last ran ${Math.floor(daysSince)} day(s) ago (next in ${AUDIT_INTERVAL_DAYS - Math.floor(daysSince)} day(s))`);
      runAudit = false;
    }
  } catch { /* flag file missing — run audit */ }

  if (runAudit) {
    console.log('[SECURITY 🔍] Running npm audit in background...');
    const child = require('child_process').spawn('npm', ['audit', '--json'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true,
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.on('close', (code) => {
      try {
        const report = JSON.parse(out);
        const vulns = report.metadata?.vulnerabilities || {};
        const total = (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0) + (vulns.low || 0);
        const logDir = path.resolve(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        if (total === 0) {
          console.log('[SECURITY ✅] npm audit: 0 vulnerabilities found');
        } else {
          console.warn(`[SECURITY ⚠️ ] npm audit: ${total} vulnerabilities (critical:${vulns.critical||0} high:${vulns.high||0} moderate:${vulns.moderate||0} low:${vulns.low||0}). Run: npm audit fix`);
        }
        fs.writeFileSync(auditFlagFile, new Date().toISOString());
      } catch { /* audit output not parseable */ }
    });
    child.unref();
  }
})();

const { Telegraf } = require('telegraf');
const { runClaude, isComplexTask, shouldUseOllama, detectMcpServers } = require('./claude-runner');
const { runOllama, isOllamaAvailable, getAvailableModels } = require('./ollama-runner');
const { runDeepSeek, DEEPSEEK_MODELS } = require('./deepseek-runner');
const { logMessage, getRecentMessages, getPreferredModel, setPreferredModel, logEvent, getSessionEvents, getUserMaxTurns, setUserMaxTurns } = require('./database');
const { isUserAllowed, splitMessage, markdownToHtml } = require('./utils');
const { saveNote, listNotes, classifyTags } = require('./handlers/obsidianSave');
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://api.telegram.org',
    agent: new (require('https').Agent)({ keepAlive: true, timeout: 120000 }),
    webhookReply: false,
  },
  handlerTimeout: 1_800_000, // 30 min — match Claude's hard timeout
});
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

// Track users currently being processed to prevent duplicate spawns
const processingUsers = new Map(); // userId -> { startTime, messageId, abort }

// Per-user last message (for /retry) and system prompts (for /sys)
const lastUserMessage = new Map(); // userId -> last message text
const userSystemPrompts = new Map(); // userId -> custom system prompt string

// Helper: Resolve file path relative to workspace (security: prevent path traversal)
const resolvePath = (filePath) => {
  if (!filePath) return null;
  const workspace = path.resolve(process.env.WORKSPACE_DIR || process.cwd());
  let resolved = filePath.trim();
  // Always anchor to workspace, reject absolute user paths
  resolved = path.resolve(workspace, resolved);
  // Security: must stay inside workspace directory
  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
    return null; // path traversal attempt detected
  }
  return resolved;
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

// Middleware: Only respond in allowed chats and users. Ignore everything else.
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;
  const userId = String(ctx.from?.id);

  // Enforce user-level whitelist (ALLOWED_TELEGRAM_IDS)
  if (!isUserAllowed(userId)) {
    console.log(`[${new Date().toLocaleTimeString()}] ⛔ Ignored user ${userId} (not in ALLOWED_TELEGRAM_IDS)`);
    return;
  }

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
  `Commands:\n/new - New conversation\n/status - Bot status\n/model - Select AI model\n/test - Test CLI\n` +
  `/cancel - Cancel current request\n/cd <path> - Change workspace\n/sendfile <name> - Send file\n` +
  `/save <title>\\n<content|url> - Save text to Obsidian\n/savelist - Last 5 saved notes\n` +
  `/debug_session - Show last session routing events\n/maxturn <n> - Set max turns (1-100)\n\n` +
  `Auto-save: prefix message with 📥 or #note\n` +
  `Save file: send photo/doc with caption starting /save <title> or 📥 <title>\n\nJust send a message!`
));

bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

bot.command('new', async (ctx) => {
  ctx.reply('New conversation started. (Each message already uses fresh context from last 5 messages.)');
});

bot.command('status', async (ctx) => {
  const recent = getRecentMessages(ctx.from.id.toString(), 1);
  const lastMsg = recent.length > 0 ? new Date(recent[0].created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : 'None';
  const model = getPreferredModel(ctx.from.id.toString());
  ctx.reply(`Status: ✅ Online\nLast message: ${lastMsg}\nWorkspace: ${process.env.WORKSPACE_DIR}\nModel: ${model}`);
});

const MODEL_LABELS = {
  auto:   'Auto (smart)',
  haiku:  'Haiku (fastest)',
  sonnet: 'Sonnet 4.6',
  opus:   'Opus 4.6 (powerful)',
  ...Object.fromEntries(Object.entries(DEEPSEEK_MODELS).map(([k, v]) => [`deepseek:${k}`, v])),
};

bot.command('model', async (ctx) => {
  const current = getPreferredModel(ctx.from.id.toString());
  const keyboard = [
    [{ text: `${current === 'auto' ? '✅ ' : ''}Auto (smart)`, callback_data: 'model:auto' }],
    [{ text: `${current === 'haiku' ? '✅ ' : ''}Haiku (fastest)`, callback_data: 'model:haiku' }],
    [{ text: `${current === 'sonnet' ? '✅ ' : ''}Sonnet 4.6`, callback_data: 'model:sonnet' }],
    [{ text: `${current === 'opus' ? '✅ ' : ''}Opus 4.6 (powerful)`, callback_data: 'model:opus' }],
  ];

  // Append DeepSeek models if API key configured
  if (process.env.DEEPSEEK_API_KEY) {
    keyboard.push([{ text: '── DeepSeek ──', callback_data: 'model:noop' }]);
    for (const [modelId, label] of Object.entries(DEEPSEEK_MODELS)) {
      const key = `deepseek:${modelId}`;
      keyboard.push([{ text: `${current === key ? '✅ ' : ''}${label}`, callback_data: `model:${key}` }]);
    }
  }

  // Append available Ollama models if Ollama is reachable
  const ollamaModels = await getAvailableModels();
  if (ollamaModels.length > 0) {
    keyboard.push([{ text: '── Ollama (local) ──', callback_data: 'model:noop' }]);
    for (const m of ollamaModels) {
      const key = `ollama:${m}`;
      keyboard.push([{ text: `${current === key ? '✅ ' : ''}${m}`, callback_data: `model:${key}` }]);
    }
  }

  await ctx.reply('Select AI model for your requests:', {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith('model:')) return ctx.answerCbQuery();

  // Strip the leading "model:" prefix to get the value
  const value = data.slice(6); // "model:".length === 6

  // Separator button — ignore
  if (value === 'noop') return ctx.answerCbQuery();

  const isOllamaModel = value.startsWith('ollama:');
  const isDeepSeekModel = value.startsWith('deepseek:');
  const isClaudeModel = ['auto', 'haiku', 'sonnet', 'opus'].includes(value);
  if (!isOllamaModel && !isDeepSeekModel && !isClaudeModel) return ctx.answerCbQuery('Unknown model');

  setPreferredModel(ctx.from.id.toString(), value);
  const label = isOllamaModel
    ? value.replace('ollama:', '') + ' (Ollama)'
    : (MODEL_LABELS[value] || value);
  await ctx.answerCbQuery(`Switched to ${label}`);
  await ctx.editMessageText(
    `Model set to: *${label}*\n\nAll your messages will now use this model. Use /model to change it.`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
});

bot.command('cd', (ctx) => {
  const newPath = ctx.message.text.slice(4).trim();
  if (!newPath) return ctx.reply(`Workspace: ${process.env.WORKSPACE_DIR}`);

  // Security: restrict /cd to allowed workspace roots only
  const resolved = path.resolve(newPath);
  const roots = (process.env.ALLOWED_WORKSPACE_ROOTS || process.env.WORKSPACE_DIR || '')
    .split(',').map(r => path.resolve(r.trim())).filter(Boolean);

  const isAllowed = roots.some(root => resolved.startsWith(root + path.sep) || resolved === root);
  if (!isAllowed) {
    ctx.reply(`❌ Path not allowed. Allowed directories: ${roots.join(', ')}`);
    return;
  }

  if (!fs.existsSync(resolved)) {
    ctx.reply(`❌ Path not found`);
    return;
  }

  process.env.WORKSPACE_DIR = resolved;
  ctx.reply(`✅ Changed to: ${resolved}`);
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

// Escape user-controlled strings before embedding in Telegram HTML messages
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// /debug-session — show last session's routing events (Phase 3: structured audit trail)
bot.command('debug_session', async (ctx) => {
  const userId = ctx.from.id.toString();
  const events = getSessionEvents(userId, 20);
  if (events.length === 0) {
    return ctx.reply('No session events recorded yet. Send a message first.');
  }
  const lines = events.map(e => {
    const t = new Date(e.created_at).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    return `[${t}] <b>${escapeHtml(e.event_type)}</b>: ${escapeHtml(e.detail)}`;
  });
  await ctx.reply(`<b>Last ${events.length} session events:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
});

// /maxturn <n> — set per-user max turns budget (Phase 4: budget control)
bot.command('maxturn', async (ctx) => {
  const userId = ctx.from.id.toString();
  const arg = ctx.message.text.split(' ')[1];
  if (!arg) {
    const current = getUserMaxTurns(userId);
    return ctx.reply(`Current max turns: ${current}\nUsage: /maxturn <1-100>`);
  }
  const n = parseInt(arg, 10);
  if (isNaN(n) || n < 1 || n > 100) {
    return ctx.reply('Invalid value. Use a number between 1 and 100.');
  }
  setUserMaxTurns(userId, n);
  ctx.reply(`✅ Max turns set to ${n}. Applies to your next Claude request.`);
});

bot.command('sendfile', async (ctx) => {
  const file = ctx.message.text.slice(10).trim();
  if (!file) return ctx.reply('Usage: /sendfile <filename>');

  const fullPath = resolvePath(file);
  if (!fullPath) return ctx.reply(`❌ Access denied.`); // path traversal attempt
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

bot.command('save', async (ctx) => {
  const body = ctx.message.text.slice(6).trim(); // strip "/save "
  if (!body) return ctx.reply('Usage: /save <title>\n<content or url>');

  // Format: /save <title>\n<content|url>  — title is full first line, content after newline
  // Single-line fallback: auto-generate title from first 5 words, use full body as content
  const newlineIdx = body.indexOf('\n');
  let title, content;
  if (newlineIdx !== -1) {
    title = body.slice(0, newlineIdx).trim();
    content = body.slice(newlineIdx + 1).trim();
  } else {
    content = body.trim();
    title = content.split(/\s+/).slice(0, 5).join(' ');
  }

  if (!content) return ctx.reply('Usage: /save <title>\n<content or url>');

  try {
    const { filename, preview } = await saveNote(title, content);
    await ctx.reply(
      `✅ Saved: ${filename}\n📁 00-inbox/${filename}\n\n${preview}${preview.length >= 100 ? '...' : ''}`
    );
  } catch (e) {
    await ctx.reply(`❌ Save failed: ${e.message}`);
  }
});

bot.command('savelist', async (ctx) => {
  const notes = listNotes(5);
  if (notes.length === 0) return ctx.reply('No notes saved yet.');
  await ctx.reply(`📚 Last ${notes.length} saved notes:\n\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
});

bot.command('retry', async (ctx) => {
  const userId = ctx.from.id.toString();
  const last = lastUserMessage.get(userId);
  if (!last) return ctx.reply('No previous message to retry.');
  // Mutate ctx so the text handler below picks it up as a normal message
  ctx.message = { ...ctx.message, text: last };
  await ctx.reply(`🔄 Retrying: _${last.slice(0, 80)}${last.length > 80 ? '…' : ''}_`, { parse_mode: 'Markdown' });
  return bot.handleUpdate({ ...ctx.update, message: ctx.message });
});

bot.command('sys', async (ctx) => {
  const userId = ctx.from.id.toString();
  const prompt = ctx.message.text.slice(5).trim();
  if (!prompt) {
    const current = userSystemPrompts.get(userId);
    return ctx.reply(current
      ? `Current system prompt:\n\`${current}\`\n\nSend /sys clear to remove it.`
      : 'No system prompt set. Usage: /sys <your prompt>');
  }
  if (prompt === 'clear') {
    userSystemPrompts.delete(userId);
    return ctx.reply('✅ System prompt cleared.');
  }
  userSystemPrompts.set(userId, prompt);
  ctx.reply(`✅ System prompt set:\n\`${prompt}\``);
});

bot.command('keys', (ctx) => {
  const check = (name, envKey) => `${name}: ${process.env[envKey] ? '✅' : '❌'}`;
  const lines = [
    check('Claude CLI', 'ANTHROPIC_AUTH_TOKEN'),
    check('DeepSeek', 'DEEPSEEK_API_KEY'),
    check('Telegram', 'TELEGRAM_BOT_TOKEN'),
    check('Gmail', 'GMAIL_CLIENT_ID'),
    check('Google Drive', 'GDRIVE_CLIENT_ID'),
    check('Ollama', 'OLLAMA_BASE_URL'),
  ];
  ctx.reply(`🔑 API Keys\n\n${lines.join('\n')}`);
});

bot.command('ls', async (ctx) => {
  const workspace = path.resolve(process.env.WORKSPACE_DIR || process.cwd());
  try {
    const entries = fs.readdirSync(workspace, { withFileTypes: true });
    if (entries.length === 0) return ctx.reply('Workspace is empty.');
    const lines = entries.slice(0, 50).map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
    if (entries.length > 50) lines.push(`… and ${entries.length - 50} more`);
    await ctx.reply(`📂 ${workspace}\n\n${lines.join('\n')}`);
  } catch (e) {
    ctx.reply(`❌ ${e.message}`);
  }
});

bot.command('export', async (ctx) => {
  const userId = ctx.from.id.toString();
  const arg = ctx.message.text.split(' ')[1];
  const limit = Math.min(parseInt(arg, 10) || 50, 200);
  const rows = getRecentMessages(userId, limit);
  if (rows.length === 0) return ctx.reply('No conversation history found.');

  const lines = rows.map(r => {
    const ts = new Date(r.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    return `## [${ts}]\n\n**You:** ${r.user_message}\n\n**Bot:** ${r.bot_response}`;
  });
  const md = `# Conversation Export\n\nUser: ${userId} | Messages: ${rows.length}\n\n---\n\n${lines.join('\n\n---\n\n')}`;

  const filename = path.join(process.env.WORKSPACE_DIR || os.tmpdir(), `export_${userId}_${Date.now()}.md`);
  fs.writeFileSync(filename, md, 'utf8');
  try {
    await ctx.replyWithDocument({ source: filename, filename: path.basename(filename) });
  } finally {
    fs.unlinkSync(filename);
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  // Auto-save trigger: messages starting with 📥 or #note
  const rawText = ctx.message.text;
  if (rawText.startsWith('📥') || /^#note\b/i.test(rawText)) {
    const stripped = rawText.replace(/^📥\s*|^#note\s*/i, '').trim();
    const newlineIdx = stripped.indexOf('\n');
    const title = newlineIdx === -1 ? stripped.slice(0, 60) : stripped.slice(0, newlineIdx).trim();
    const content = newlineIdx === -1 ? stripped : stripped.slice(newlineIdx + 1).trim();
    try {
      const { filename, preview } = await saveNote(title || 'Untitled', content || stripped);
      await ctx.reply(
        `✅ Saved: ${filename}\n📁 00-inbox/${filename}\n\n${preview}${preview.length >= 100 ? '...' : ''}`
      );
    } catch (e) {
      await ctx.reply(`❌ Save failed: ${e.message}`);
    }
    return;
  }

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

  const complex = isComplexTask(ctx.message.text);
  const ollamaOk = await isOllamaAvailable();
  const mcpServers = detectMcpServers(ctx.message.text);
  const preferredModel = getPreferredModel(userId);
  const isOllamaPreferred = preferredModel.startsWith('ollama:');
  const ollamaModelName = isOllamaPreferred ? preferredModel.slice(7) : null; // strip "ollama:"
  const isDeepSeekPreferred = preferredModel.startsWith('deepseek:');
  const deepSeekModelName = isDeepSeekPreferred ? preferredModel.slice(9) : null; // strip "deepseek:"

  // Tasks that require file tool access — must use Claude even if Ollama is selected
  // IMPORTANT: compute needsClaude BEFORE useOllama so the guard works correctly
  const FILE_TASK_PATTERNS = [
    /\.(docx|xlsx|pptx|pdf|csv|txt|json|py|js|ts|html|css|md)\b/i,
    /\b(save|export|create|generate|write|make|build)\b.{0,40}\b(file|document|doc|word|excel|spreadsheet|pdf|script|report)\b/i,
    /\b(docx|word doc|word file|excel file|pdf file|powerpoint|slide deck)\b/i,
    /\bdownload\b|\bsend me\b.{0,20}\bfile\b/i,
  ];
  const needsClaude = FILE_TASK_PATTERNS.some(p => p.test(ctx.message.text));

  // Only auto-route to Ollama when user hasn't explicitly chosen a Claude model
  // AND the task doesn't need file tools (Ollama can't write files — it would say "I can't save files")
  const useOllama = !needsClaude && ((preferredModel === 'auto' || preferredModel.startsWith('ollama:'))
    ? shouldUseOllama(ctx.message.text, ollamaOk, mcpServers)
    : false);

  // If Ollama is preferred but task needs file tools, skip Ollama entirely and use Claude
  const effectiveOllama = isOllamaPreferred && !needsClaude;
  const effectiveOllamaModel = effectiveOllama ? ollamaModelName : null;

  // DeepSeek: always use when preferred (no file-tool restriction — response only)
  const effectiveDeepSeek = isDeepSeekPreferred;

  let statusMsg = '🤔 Processing...';
  if (effectiveDeepSeek) statusMsg = `🔵 Processing with ${DEEPSEEK_MODELS[deepSeekModelName] || deepSeekModelName}...`;
  else if (effectiveOllama) statusMsg = `🦙 Processing with ${ollamaModelName}...`;
  else if (isOllamaPreferred && needsClaude) statusMsg = `🤔 Processing with Claude (file task — Ollama has no file tools)...`;
  else if (preferredModel !== 'auto') statusMsg = `🤔 Processing with ${MODEL_LABELS[preferredModel] || preferredModel}...`;
  else if (complex) statusMsg = '🧠 Processing with Opus...';
  else if (useOllama) statusMsg = '🦙 Processing with Ollama...';

  console.log(`[${new Date().toLocaleTimeString()}] ⚙️  Processing for ${ctx.from?.username || userId}${complex ? ' [OPUS]' : useOllama ? ' [OLLAMA]' : ''}...`);
  const msg = await ctx.reply(statusMsg);
  const abort = new AbortController();
  let lastStatus = 'Thinking...';
  processingUsers.set(userId, { startTime: Date.now(), messageId: msg.message_id, abort });

  const onProgress = (status) => {
    if (status) lastStatus = typeof status === 'string' ? status : 'Thinking...';
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

  // Run Claude or Ollama — awaited directly (not setImmediate) to prevent Telegraf re-queue
  const startTime = Date.now();
  let prompt = ctx.message.text;
  lastUserMessage.set(userId, prompt);

  // Check for /ollama prefix to force Ollama routing
  let forcedOllama = false;
  if (prompt.startsWith('/ollama ')) {
    forcedOllama = true;
    prompt = prompt.slice(8).trim(); // Strip /ollama prefix
  }

  try {
    // For Ollama, use simple prompt without context injection
    let finalPrompt = prompt;

    // Prepend user system prompt if set
    const sysPrompt = userSystemPrompts.get(userId);
    if (sysPrompt) finalPrompt = `[System: ${sysPrompt}]\n\n${finalPrompt}`;

    if (!forcedOllama && !useOllama && !effectiveOllama) {
      // Claude path — inject full context

      // Build prompt — include reply context if user replied to a bot message
      const replied = ctx.message.reply_to_message;
      if (replied?.from?.id === (await ctx.telegram.getMe()).id && replied?.text) {
        const quoted = replied.text.slice(0, 500);
        prompt = `[Replying to your message: "${quoted}"]\n\n${prompt}`;
      }

      // Inject chat context so Claude knows where the message came from
      const chatType = ctx.chat?.type; // 'private', 'group', or 'supergroup'
      const isGroup = chatType === 'group' || chatType === 'supergroup';
      const userName = ctx.from?.first_name || ctx.from?.username || 'Unknown';
      const BOT_CAPABILITIES = `[Bot capabilities already handled natively — DO NOT re-implement or ask user to confirm these]:
- /save <title> or 📥 prefix → saves to Obsidian inbox automatically (already done if user used it)
- /savelist → lists recent Obsidian notes
- /sendfile → sends workspace file via Telegram
- /model → switches AI model
- /retry → resends last message
- /sys → sets system prompt
- /export → exports conversation history
- If you see "save in obsidian inbox" or similar in conversation history, the bot already handled it. Do NOT ask the user to confirm or repeat it.`;
      const chatContext = isGroup
        ? `[Chat context: Telegram GROUP chat ${chatId}. Send files/messages to GROUP $TELEGRAM_GROUP_CHAT_ID]\n[User: ${userName} (ID: ${userId})]\n${BOT_CAPABILITIES}`
        : `[Chat context: Telegram DM (private) chat ${chatId}. Send files/messages to DM $TELEGRAM_DM_CHAT_ID]\n[User: ${userName} (ID: ${userId})]\n${BOT_CAPABILITIES}`;

      // Always inject recent history — every message is a fresh Claude process
      const recent = getRecentMessages(userId, 10);
      if (recent.length > 0) {
        const history = recent.map(m => {
          const time = new Date(m.created_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });
          const userMsg = (m.user_message || '').slice(0, 200);
          const botMsg = (m.bot_response || '').slice(0, 300);
          return `[${time}] User: ${userMsg}\n[${time}] Bot: ${botMsg}`;
        }).join('\n\n');
        finalPrompt = `${chatContext}\n[Recent conversation history for context]\n${history}\n\n---\n[Current message]\n${prompt}`;
      } else {
        finalPrompt = `${chatContext}\n${prompt}`;
      }
    }

    // Route to DeepSeek, Ollama (with Claude fallback), or Claude directly
    let result;
    if (effectiveDeepSeek) {
      result = await runDeepSeek(finalPrompt, { model: deepSeekModelName, onProgress, signal: abort.signal });
      if (process.env.SHOW_MODEL_FOOTER === 'true') {
        result.response += `\n\n---\n*[Answered by: ${result.model} via DeepSeek]*`;
      }
    } else if (effectiveOllama) {
      // User explicitly selected an Ollama model — use it directly, no fallback
      result = await runOllama(finalPrompt, { onProgress, signal: abort.signal, modelName: effectiveOllamaModel });
      if (process.env.SHOW_MODEL_FOOTER === 'true') {
        result.response += `\n\n---\n*[Answered by: ${result.model} via Ollama]*`;
      }
    } else if (forcedOllama || useOllama) {
      try {
        result = await runOllama(finalPrompt, { onProgress, signal: abort.signal });
        if (process.env.SHOW_MODEL_FOOTER === 'true') {
          result.response += `\n\n---\n*[Answered by: ${result.model} via Ollama]*`;
        }
      } catch (ollamaErr) {
        if (abort.signal.aborted || ollamaErr.message === 'Request cancelled') throw ollamaErr;
        console.log(`[${new Date().toLocaleTimeString()}] ⚠️  Ollama failed (${ollamaErr.message}), falling back to Claude...`);
        // Fall back to Claude — rate limit errors will propagate to outer catch
        result = await runClaude(finalPrompt, { onProgress, signal: abort.signal });
      }
    } else {
      // Use Claude (with full context)
      const maxTurns = getUserMaxTurns(userId);
      const mcpLoaded = Object.keys(detectMcpServers(finalPrompt));
      logEvent(userId, 'routing', `model=${preferredModel} maxTurns=${maxTurns} mcp=${mcpLoaded.join(',') || 'none'}`);
      result = await runClaude(finalPrompt, { onProgress, signal: abort.signal, modelOverride: preferredModel, maxTurns });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Reply to ${ctx.from?.username || userId} (${elapsed}s, ${result.response.length} chars)`);

    await logMessage(userId, prompt, result.response);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    await sendResponse(ctx.telegram, chatId, result.response, userId);
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Error for ${ctx.from?.username || userId} (${elapsed}s): ${e.message}`);
    // Log failed/cancelled requests to audit_log too
    await logMessage(userId, prompt, `[ERROR after ${elapsed}s] ${e.message}`);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    if (e.isRateLimit) {
      const resetInfo = e.resetsAt
        ? `\n\nService resets at ${new Date(e.resetsAt * 1000).toLocaleTimeString()}.`
        : '';
      await ctx.telegram.sendMessage(chatId,
        `🤖 I'm temporarily unavailable.\n\nThe AI service has reached its usage limit.${resetInfo}\n\nPlease try again later.`
      );
    } else if (e.message !== 'Request cancelled') {
      await ctx.telegram.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  } finally {
    clearInterval(progressInterval);
    processingUsers.delete(userId);
  }
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
    if (status) lastStatus = typeof status === 'string' ? status : 'Thinking...';
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
    // Preserve original filename for documents, fallback to URL extension
    const origName = ctx.message?.document?.file_name;
    const ext = origName ? path.extname(origName) : (path.extname(new URL(link.href).pathname) || '.tmp');
    const dest = path.join(process.env.WORKSPACE_DIR, `upload_${Date.now()}${ext}`);
    await downloadFile(link.href, dest);

    // Inject chat context so Claude knows where the message came from
    const chatType = ctx.chat?.type;
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const chatContext = isGroup
      ? `[Chat context: Telegram GROUP chat ${chatId}. Send files/messages to GROUP $TELEGRAM_GROUP_CHAT_ID]`
      : `[Chat context: Telegram DM (private) chat ${chatId}. Send files/messages to DM $TELEGRAM_DM_CHAT_ID]`;
    const filePrompt = `${chatContext}\n${prompt}\n\nThe user sent a file. It has been downloaded to: ${dest}\nOriginal filename: ${origName || 'unknown'}\nPlease read/process this file to answer the user's request.`;
    const result = await runClaude(filePrompt, { onProgress, signal: abort.signal });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Media reply to ${ctx.from?.username || userId} (${elapsed}s)`);
    await logMessage(userId, filePrompt, result.response);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    await sendResponse(ctx.telegram, chatId, result.response);
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Media error for ${ctx.from?.username || userId} (${elapsed}s): ${e.message}`);
    await logMessage(userId, prompt, `[ERROR after ${elapsed}s] ${e.message}`);
    await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
    if (e.isRateLimit) {
      const resetInfo = e.resetsAt
        ? `\n\nService resets at ${new Date(e.resetsAt * 1000).toLocaleTimeString()}.`
        : '';
      await ctx.reply(`🤖 I'm temporarily unavailable.\n\nThe AI service has reached its usage limit.${resetInfo}\n\nPlease try again later.`);
    } else if (e.message !== 'Request cancelled') {
      await ctx.reply(`❌ ${e.message}`);
    }
  } finally {
    clearInterval(progressInterval);
    processingUsers.delete(userId);
  }
};

// Save file directly to Obsidian inbox when caption starts with /save or 📥
// For images, also writes a companion .md note with embedded image + analysis template.
// Caption format: "📥 Title | Explanation / analysis text here"
// Everything before "|" = title; everything after = body/analysis
const handleMediaSave = async (ctx, getFileId, origName, ext) => {
  const caption = ctx.message.caption || '';
  const isSaveTrigger = caption.startsWith('/save') || caption.startsWith('📥');
  if (!isSaveTrigger) return false;

  const stripped = caption.replace(/^\/save\s*|^📥\s*/u, '').trim();
  const pipeIdx = stripped.indexOf('|');
  const title = (pipeIdx > 0 ? stripped.slice(0, pipeIdx) : stripped).trim()
    || origName?.replace(/\.[^.]+$/, '') || 'untitled';
  const analysis = pipeIdx > 0 ? stripped.slice(pipeIdx + 1).trim() : '';

  const vaultInbox = process.env.VAULT_DIR
    ? `${process.env.VAULT_DIR}/00-inbox`
    : '/home/lerler/ObsidianVault/00-inbox';
  const date = new Date().toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 60);
  const imgFilename = `${date}-${slug}${ext}`;
  const dest = `${vaultInbox}/${imgFilename}`;

  try {
    const link = await ctx.telegram.getFileLink(getFileId(ctx));
    await downloadFile(link.href, dest);

    // Write companion .md for image files (searchable, embeddable, ML-ready)
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase());
    if (isImage) {
      const autoTags = classifyTags(title, analysis);
      const tags = [...new Set(['image', ...autoTags])];
      const mdFilename = `${date}-${slug}.md`;
      const mdDest = `${vaultInbox}/${mdFilename}`;
      const mdContent = [
        '---',
        `title: "${title}"`,
        `date: ${date}`,
        `tags: [${tags.join(', ')}]`,
        'source: telegram',
        'type: chart-analysis',
        'status: inbox',
        '---',
        '',
        `# ${title}`,
        '',
        `![[${imgFilename}]]`,
        '',
        '## Analysis',
        '',
        analysis || '_Add analysis here_',
        '',
        '## Outcome',
        '',
        '_To be confirmed — fill after event_',
        '',
      ].join('\n');
      fs.writeFileSync(mdDest, mdContent, 'utf8');
      await ctx.reply(`✅ Saved image + note to 00-inbox/\n📄 ${mdFilename}`);
    } else {
      await ctx.reply(`✅ Saved to 00-inbox/${imgFilename}`);
    }
  } catch (e) {
    await ctx.reply(`❌ Save failed: ${e.message}`);
  }
  return true;
};

bot.on('photo', async (ctx) => {
  const ext = '.jpg';
  const saved = await handleMediaSave(ctx,
    (c) => c.message.photo[c.message.photo.length - 1].file_id,
    'image', ext
  );
  if (!saved) handleMedia(ctx,
    (c) => c.message.photo[c.message.photo.length - 1].file_id,
    ctx.message.caption || 'Analyze this image'
  );
});

bot.on('document', async (ctx) => {
  const origName = ctx.message.document.file_name || 'file';
  const ext = path.extname(origName) || '.bin';
  const saved = await handleMediaSave(ctx,
    (c) => c.message.document.file_id,
    origName, ext
  );
  if (!saved) handleMedia(ctx,
    (c) => c.message.document.file_id,
    ctx.message.caption || `Process: ${origName}`
  );
});

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
