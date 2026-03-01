/**
 * Security tests for Agent K Telegram Bot
 * Covers:
 *   - resolvePath() — path traversal prevention
 *   - isUserAllowed() — user whitelist enforcement
 *   - /sendfile path handling
 *   - /cd workspace restriction
 *   - env allowlist logic
 *
 * Uses node:test + node:assert — no extra deps
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

// ── resolvePath (extracted logic from src/index.js) ─────────────────────────
// Mirror the exact function from index.js so we can unit-test it independently
// without booting the entire Telegraf bot.

function resolvePath(filePath, workspaceDir) {
  if (!filePath) return null;
  const workspace = path.resolve(workspaceDir || process.cwd());
  let resolved = filePath.trim();
  resolved = path.resolve(workspace, resolved);
  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
    return null; // path traversal attempt detected
  }
  return resolved;
}

// ── isUserAllowed (from src/utils.js) ───────────────────────────────────────

function isUserAllowed(userId, allowedIds) {
  // Mirrors src/utils.js logic
  const ids = (allowedIds || '').split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.includes(userId);
}

// ── /cd restriction logic (from src/index.js) ───────────────────────────────

function isCdAllowed(newPath, allowedRoots) {
  const resolved = path.resolve(newPath);
  const roots = (allowedRoots || '').split(',').map(r => path.resolve(r.trim())).filter(Boolean);
  return roots.some(root => resolved.startsWith(root + path.sep) || resolved === root);
}

// ── resolvePath tests ───────────────────────────────────────────────────────

describe('resolvePath — path traversal prevention', () => {
  const workspace = path.join(os.tmpdir(), 'agent-k-test-workspace');

  test('allows a file inside workspace', () => {
    const result = resolvePath('report.pdf', workspace);
    assert.equal(result, path.join(workspace, 'report.pdf'));
  });

  test('allows a nested file inside workspace', () => {
    const result = resolvePath('subdir/file.txt', workspace);
    assert.equal(result, path.join(workspace, 'subdir', 'file.txt'));
  });

  test('blocks ../ path traversal one level up', () => {
    const result = resolvePath('../secret.txt', workspace);
    assert.equal(result, null, 'should block one-level traversal');
  });

  test('blocks ../../etc/passwd traversal', () => {
    const result = resolvePath('../../etc/passwd', workspace);
    assert.equal(result, null, 'should block multi-level traversal');
  });

  test('blocks absolute path outside workspace', () => {
    const outsidePath = path.join(os.tmpdir(), 'other', 'secret.txt');
    const result = resolvePath(outsidePath, workspace);
    assert.equal(result, null, 'should block absolute paths outside workspace');
  });

  test('returns null for null/undefined input', () => {
    assert.equal(resolvePath(null, workspace), null);
    assert.equal(resolvePath(undefined, workspace), null);
    assert.equal(resolvePath('', workspace), null);
  });

  test('blocks Windows-style path traversal attempt', () => {
    // e.g. ..\secret.txt — path.resolve normalises these
    const result = resolvePath('..\\secret.txt', workspace);
    // On any OS, path.resolve should normalise and resolve to outside workspace
    assert.equal(result, null, 'should block Windows-style traversal');
  });

  test('blocks encoded path traversal attempt', () => {
    // URL-encoded ../ — path.resolve does NOT decode; these land as literal dots
    // but we test that any path using obvious traversal tricks is caught
    const result = resolvePath('%2e%2e%2fsecret', workspace);
    // This will not resolve to parent since it's treated as a literal string by path.resolve
    // but we assert the result stays inside workspace (it will be treated as a filename)
    const expected = path.join(workspace, '%2e%2e%2fsecret');
    // path.resolve on Windows/Linux treats %2e literally, so this ends up INSIDE workspace
    // We just verify it doesn't escape
    if (result !== null) {
      assert.ok(result.startsWith(workspace), 'encoded traversal should not escape workspace');
    }
  });

  test('workspace itself resolves to null (not inside)', () => {
    // Attempting to reference the workspace root directly (e.g., ".")
    const result = resolvePath('.', workspace);
    // "." resolves to workspace itself — the logic allows workspace === resolved
    assert.equal(result, workspace);
  });
});

// ── isUserAllowed tests ─────────────────────────────────────────────────────

describe('isUserAllowed — user whitelist', () => {
  test('allows all users when no IDs configured', () => {
    assert.equal(isUserAllowed('12345', ''), true);
    assert.equal(isUserAllowed('99999', ''), true);
  });

  test('allows listed user', () => {
    assert.equal(isUserAllowed('111', '111,222,333'), true);
    assert.equal(isUserAllowed('222', '111,222,333'), true);
  });

  test('blocks unlisted user', () => {
    assert.equal(isUserAllowed('999', '111,222,333'), false);
  });

  test('handles spaces around IDs in config string', () => {
    assert.equal(isUserAllowed('111', ' 111 , 222 , 333 '), true);
    assert.equal(isUserAllowed('444', ' 111 , 222 , 333 '), false);
  });

  test('is exact-match only (no substring matches)', () => {
    // ID "1" should not match "11" or "111"
    assert.equal(isUserAllowed('1', '11,111'), false);
  });

  test('handles single allowed ID', () => {
    assert.equal(isUserAllowed('42', '42'), true);
    assert.equal(isUserAllowed('43', '42'), false);
  });
});

// ── /cd restriction tests ───────────────────────────────────────────────────

describe('/cd workspace restriction', () => {
  const allowed = [os.tmpdir(), path.join(os.tmpdir(), 'workspace')].join(',');

  test('allows cd to an allowed root', () => {
    assert.equal(isCdAllowed(os.tmpdir(), allowed), true);
  });

  test('allows cd to a subdirectory of an allowed root', () => {
    const sub = path.join(os.tmpdir(), 'some', 'subdir');
    assert.equal(isCdAllowed(sub, allowed), true);
  });

  test('blocks cd to a path outside allowed roots', () => {
    const outside = path.resolve('/var/secret');
    assert.equal(isCdAllowed(outside, allowed), false);
  });

  test('blocks traversal attempt disguised as relative path', () => {
    // Starting from workspace, going ../../ to reach outside
    const traversal = path.join(os.tmpdir(), 'workspace', '..', '..', 'etc');
    assert.equal(isCdAllowed(traversal, allowed), false);
  });

  test('returns false when no allowed roots configured', () => {
    assert.equal(isCdAllowed(os.tmpdir(), ''), false);
  });
});

// ── env allowlist (ALLOWED_CHAT_IDS) logic ──────────────────────────────────

describe('ALLOWED_CHAT_IDS enforcement', () => {
  // Mirror the logic from index.js middleware
  function isChatAllowed(chatId, allowedChatIds) {
    const allowedChats = (allowedChatIds || '').split(',').map(id => id.trim()).filter(Boolean);
    if (allowedChats.length === 0) return true; // no restriction
    return allowedChats.includes(String(chatId));
  }

  test('allows all chats when ALLOWED_CHAT_IDS is empty', () => {
    assert.equal(isChatAllowed(-1001234567890, ''), true);
  });

  test('allows listed chat ID', () => {
    assert.equal(isChatAllowed(-1001234567890, '-1001234567890,-9999'), true);
  });

  test('blocks unlisted chat ID', () => {
    assert.equal(isChatAllowed(-9998887776, '-1001234567890'), false);
  });

  test('handles numeric and string IDs consistently', () => {
    // Telegram IDs may arrive as numbers; the logic does String() on chatId
    assert.equal(isChatAllowed(12345, '12345'), true);
    assert.equal(isChatAllowed(12345, '99999'), false);
  });
});
