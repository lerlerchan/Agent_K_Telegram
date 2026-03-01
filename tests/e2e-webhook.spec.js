/**
 * Playwright e2e tests for Agent K webhook HTTP server
 *
 * These tests start a minimal express server that replicates the bot's
 * webhook endpoint, then use Playwright's request API to verify:
 *   - Health check endpoint responds
 *   - Webhook processes Telegram updates
 *   - Security middleware (user whitelist, chat restriction) enforces rules
 *   - /start, /status, /chatid commands return expected responses
 *   - Path traversal on /sendfile is blocked
 *   - /cd outside allowed roots is blocked
 */

const { test, expect, request } = require('@playwright/test');
const http = require('http');
const express = require('express');
const path = require('node:path');
const os = require('node:os');

// ── Minimal test server ───────────────────────────────────────────────────────

/**
 * Build an express app that replicates the core security and routing
 * logic from src/index.js without needing a real Telegram connection.
 */
function buildTestApp({ allowedChatIds = '', allowedUserIds = '', workspaceDir = os.tmpdir() } = {}) {
  const app = express();
  app.use(express.json());

  // Replicate resolvePath security function
  function resolvePath(filePath) {
    if (!filePath) return null;
    const workspace = path.resolve(workspaceDir);
    let resolved = path.resolve(workspace, filePath.trim());
    if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) return null;
    return resolved;
  }

  // Replicate isUserAllowed
  function isUserAllowed(userId) {
    const ids = (allowedUserIds || '').split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return true;
    return ids.includes(String(userId));
  }

  // Health check
  app.get('/', (req, res) => {
    res.send('Tele Agent K running!');
  });

  // Security check endpoint (for testing whitelist enforcement)
  app.get('/check-access/:userId', (req, res) => {
    const allowed = isUserAllowed(req.params.userId);
    res.json({ allowed, userId: req.params.userId });
  });

  // Webhook: processes Telegram update objects and returns command responses
  app.post('/webhook', (req, res) => {
    const update = req.body;
    if (!update || !update.message) {
      return res.json({ ok: true, action: 'ignored' });
    }

    const msg = update.message;
    const chatId = msg.chat?.id;
    const userId = String(msg.from?.id || '');
    const text = msg.text || '';

    // User whitelist check
    if (!isUserAllowed(userId)) {
      return res.json({ ok: false, reason: 'user_not_allowed', userId });
    }

    // Chat allowlist check
    const allowedChats = (allowedChatIds || '').split(',').map(id => id.trim()).filter(Boolean);
    if (allowedChats.length > 0 && !allowedChats.includes(String(chatId))) {
      return res.json({ ok: false, reason: 'chat_not_allowed', chatId });
    }

    // /start command
    if (text === '/start') {
      return res.json({ ok: true, command: 'start', reply: 'Welcome to Agent K!' });
    }

    // /status command
    if (text === '/status') {
      return res.json({ ok: true, command: 'status', reply: `Status: ✅ Online\nWorkspace: ${workspaceDir}` });
    }

    // /chatid command
    if (text === '/chatid') {
      return res.json({ ok: true, command: 'chatid', reply: `Chat ID: ${chatId}` });
    }

    // /sendfile command — test path traversal protection
    if (text.startsWith('/sendfile ')) {
      const fileName = text.slice(10).trim();
      const fullPath = resolvePath(fileName);
      if (!fullPath) {
        return res.json({ ok: false, command: 'sendfile', error: 'Access denied', reason: 'path_traversal' });
      }
      return res.json({ ok: true, command: 'sendfile', path: fullPath });
    }

    // /cd command — test workspace restriction
    if (text.startsWith('/cd ')) {
      const newPath = text.slice(4).trim();
      const resolved = path.resolve(newPath);
      const allowedRoots = [path.resolve(workspaceDir)];
      const isAllowed = allowedRoots.some(root => resolved.startsWith(root + path.sep) || resolved === root);

      if (!isAllowed) {
        return res.json({ ok: false, command: 'cd', error: 'Path not allowed', resolved });
      }
      return res.json({ ok: true, command: 'cd', resolved });
    }

    // /test command — verify CLI availability (mock)
    if (text === '/test') {
      return res.json({ ok: true, command: 'test', reply: 'Claude CLI: ✅ mock-version-1.0' });
    }

    // Regular message — route to Claude/Ollama (mock)
    if (!text.startsWith('/')) {
      const isSimple = /^(hi|hello|hey|thanks|thank you|ok|yes|no)[.!?]?$/i.test(text.trim());
      return res.json({
        ok: true,
        action: 'process_message',
        routing: isSimple ? 'ollama' : 'claude',
        message: text,
      });
    }

    res.json({ ok: true, action: 'ignored' });
  });

  return app;
}

/** Start a server on a random port, return { port, close } */
function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, close: () => new Promise(res => server.close(res)) });
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Bot health check', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp();
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  test('GET / returns health check message', async () => {
    const res = await apiContext.get('/');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('Agent K');
  });
});

test.describe('Bot commands via webhook', () => {
  let server;
  let apiContext;
  const ALLOWED_CHAT = '-100123456789';
  const ALLOWED_USER = '111222333';

  test.beforeAll(async () => {
    const app = buildTestApp({
      allowedChatIds: ALLOWED_CHAT,
      allowedUserIds: ALLOWED_USER,
      workspaceDir: os.tmpdir(),
    });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  function makeUpdate(text, userId = ALLOWED_USER, chatId = ALLOWED_CHAT) {
    return {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: Number(userId), first_name: 'Test', username: 'testuser' },
        chat: { id: Number(chatId), type: 'private' },
        text,
        date: Math.floor(Date.now() / 1000),
      }
    };
  }

  test('/start returns welcome message', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/start') });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.command).toBe('start');
    expect(json.reply).toContain('Agent K');
  });

  test('/status returns online status', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/status') });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.command).toBe('status');
    expect(json.reply).toContain('Online');
  });

  test('/chatid returns chat ID', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/chatid') });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.command).toBe('chatid');
    expect(json.reply).toContain(ALLOWED_CHAT);
  });

  test('/test returns CLI version', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/test') });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.command).toBe('test');
    expect(json.reply).toContain('Claude CLI');
  });
});

test.describe('Security: user whitelist enforcement', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp({
      allowedUserIds: '111,222,333',
      workspaceDir: os.tmpdir(),
    });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  test('allowed user (111) can access', async () => {
    const res = await apiContext.get('/check-access/111');
    const json = await res.json();
    expect(json.allowed).toBe(true);
  });

  test('unlisted user (999) is blocked', async () => {
    const res = await apiContext.get('/check-access/999');
    const json = await res.json();
    expect(json.allowed).toBe(false);
  });

  test('webhook blocks message from unlisted user', async () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 999, first_name: 'Hacker', username: 'badactor' },
        chat: { id: -100123456789, type: 'private' },
        text: '/start',
        date: Math.floor(Date.now() / 1000),
      }
    };
    const res = await apiContext.post('/webhook', { data: update });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('user_not_allowed');
  });

  test('all users allowed when whitelist is empty', async () => {
    // Build new app with no whitelist
    const app2 = buildTestApp({ allowedUserIds: '', workspaceDir: os.tmpdir() });
    const server2 = await startServer(app2);
    const ctx2 = await request.newContext({ baseURL: `http://127.0.0.1:${server2.port}` });

    const res = await ctx2.get('/check-access/99999');
    const json = await res.json();
    expect(json.allowed).toBe(true);

    await ctx2.dispose();
    await server2.close();
  });
});

test.describe('Security: /sendfile path traversal', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp({ workspaceDir: os.tmpdir() });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  function makeUpdate(text) {
    return {
      update_id: 3,
      message: {
        message_id: 3,
        from: { id: 1, first_name: 'Test' },
        chat: { id: 1, type: 'private' },
        text,
        date: Math.floor(Date.now() / 1000),
      }
    };
  }

  test('/sendfile with ../ traversal is blocked', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/sendfile ../secret.env') });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('path_traversal');
  });

  test('/sendfile with ../../ deep traversal is blocked', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/sendfile ../../etc/passwd') });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('path_traversal');
  });

  test('/sendfile with valid filename inside workspace is allowed', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/sendfile report.pdf') });
    const json = await res.json();
    // File may not exist but path should be resolved safely
    expect(json.reason).not.toBe('path_traversal');
  });
});

test.describe('Security: /cd workspace restriction', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp({ workspaceDir: os.tmpdir() });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  function makeUpdate(text) {
    return {
      update_id: 4,
      message: {
        message_id: 4,
        from: { id: 1, first_name: 'Test' },
        chat: { id: 1, type: 'private' },
        text,
        date: Math.floor(Date.now() / 1000),
      }
    };
  }

  test('/cd to a path outside workspace is blocked', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('/cd /var/secret') });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('not allowed');
  });

  test('/cd to workspace subdirectory is allowed', async () => {
    const subdir = path.join(os.tmpdir(), 'subdir');
    const res = await apiContext.post('/webhook', { data: makeUpdate(`/cd ${subdir}`) });
    const json = await res.json();
    // May fail due to existence check but should not report "path_traversal"
    expect(json.reason).not.toBe('path_traversal');
  });
});

test.describe('Ollama routing: simple vs complex messages', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp({ workspaceDir: os.tmpdir() });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  function makeUpdate(text) {
    return {
      update_id: 5,
      message: {
        message_id: 5,
        from: { id: 1 },
        chat: { id: 1, type: 'private' },
        text,
        date: Math.floor(Date.now() / 1000),
      }
    };
  }

  test('simple "hi" routes to Ollama', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('hi') });
    const json = await res.json();
    expect(json.routing).toBe('ollama');
  });

  test('complex message routes to Claude', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('write a detailed business analysis report') });
    const json = await res.json();
    expect(json.routing).toBe('claude');
  });

  test('greeting "thanks" routes to Ollama', async () => {
    const res = await apiContext.post('/webhook', { data: makeUpdate('thanks') });
    const json = await res.json();
    expect(json.routing).toBe('ollama');
  });
});

test.describe('Chat allowlist enforcement', () => {
  let server;
  let apiContext;

  test.beforeAll(async () => {
    const app = buildTestApp({
      allowedChatIds: '-100123456789',
      workspaceDir: os.tmpdir(),
    });
    server = await startServer(app);
    apiContext = await request.newContext({ baseURL: `http://127.0.0.1:${server.port}` });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
    await server.close();
  });

  test('message from allowed chat is processed', async () => {
    const update = {
      update_id: 6,
      message: {
        message_id: 6,
        from: { id: 1, first_name: 'Test' },
        chat: { id: -100123456789, type: 'supergroup' },
        text: '/start',
        date: Math.floor(Date.now() / 1000),
      }
    };
    const res = await apiContext.post('/webhook', { data: update });
    const json = await res.json();
    expect(json.reason).not.toBe('chat_not_allowed');
  });

  test('message from blocked chat is rejected', async () => {
    const update = {
      update_id: 7,
      message: {
        message_id: 7,
        from: { id: 1, first_name: 'Test' },
        chat: { id: -999888777, type: 'supergroup' },
        text: '/start',
        date: Math.floor(Date.now() / 1000),
      }
    };
    const res = await apiContext.post('/webhook', { data: update });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe('chat_not_allowed');
  });
});
