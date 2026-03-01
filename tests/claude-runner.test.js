/**
 * Tests for src/claude-runner.js
 * Covers: isComplexTask, shouldUseOllama, detectMcpServers
 * Uses node:test + node:assert — no extra deps
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── module under test ───────────────────────────────────────────────────────
// Set a dummy env so index.js is not accidentally triggered if imported
process.env.TELEGRAM_BOT_TOKEN = 'test-token';

const { isComplexTask, shouldUseOllama, detectMcpServers } = require('../src/claude-runner');

// ── detectMcpServers ────────────────────────────────────────────────────────

describe('detectMcpServers', () => {
  test('detects playwright for browse keyword', () => {
    const servers = detectMcpServers('browse this website for me');
    assert.ok(servers.playwright, 'should detect playwright');
  });

  test('detects playwright for search keyword', () => {
    const servers = detectMcpServers('search google for weather');
    assert.ok(servers.playwright, 'should detect playwright for search');
  });

  test('detects playwright for screenshot keyword', () => {
    const servers = detectMcpServers('take a screenshot of example.com');
    assert.ok(servers.playwright, 'should detect playwright for screenshot');
  });

  test('detects playwright for boarding pass keyword', () => {
    const servers = detectMcpServers('check in for my boarding pass');
    assert.ok(servers.playwright);
  });

  test('detects gmail for email keyword', () => {
    const servers = detectMcpServers('check my email inbox');
    assert.ok(servers.gmail, 'should detect gmail for email');
  });

  test('detects gmail for send email keyword', () => {
    const servers = detectMcpServers('send email to alice@example.com');
    assert.ok(servers.gmail, 'should detect gmail for send email');
  });

  test('detects chrome-devtools for devtools keyword', () => {
    const servers = detectMcpServers('devtools inspect this page');
    assert.ok(servers['chrome-devtools'], 'should detect chrome-devtools');
  });

  test('detects multiple servers when keywords overlap', () => {
    const servers = detectMcpServers('browse to gmail and send an email');
    assert.ok(servers.playwright);
    assert.ok(servers.gmail);
  });

  test('returns empty object for plain message', () => {
    const servers = detectMcpServers('hello how are you');
    assert.deepEqual(servers, {});
  });

  test('returns empty object for calculator-style message', () => {
    const servers = detectMcpServers('what is 2 + 2');
    assert.deepEqual(servers, {});
  });

  test('is case-insensitive', () => {
    const servers = detectMcpServers('BROWSE to GOOGLE.COM');
    assert.ok(servers.playwright);
  });
});

// ── isComplexTask ───────────────────────────────────────────────────────────

describe('isComplexTask', () => {
  test('flight check-in is complex', () => {
    assert.equal(isComplexTask('check in for my flight'), true);
  });

  test('boarding pass is complex', () => {
    assert.equal(isComplexTask('get my boarding pass'), true);
  });

  test('book flight is complex', () => {
    assert.equal(isComplexTask('book a flight to Tokyo'), true);
  });

  test('refactor is complex', () => {
    assert.equal(isComplexTask('refactor this function to be cleaner'), true);
  });

  test('implement feature is complex', () => {
    assert.equal(isComplexTask('implement feature for user authentication'), true);
  });

  test('use opus is complex', () => {
    assert.equal(isComplexTask('use opus to write this email'), true);
  });

  test('playwright keyword makes it complex', () => {
    assert.equal(isComplexTask('browse the website with playwright'), true);
  });

  test('greeting is not complex', () => {
    assert.equal(isComplexTask('hello'), false);
  });

  test('simple translation is not complex', () => {
    assert.equal(isComplexTask('translate hello to malay'), false);
  });

  test('simple math is not complex', () => {
    assert.equal(isComplexTask('what is 5 + 3'), false);
  });

  test('thanks is not complex', () => {
    assert.equal(isComplexTask('thanks'), false);
  });
});

// ── shouldUseOllama ─────────────────────────────────────────────────────────

describe('shouldUseOllama', () => {
  test('returns false when ollama not available', () => {
    assert.equal(shouldUseOllama('hello', false, {}), false);
  });

  test('returns false for complex tasks even if ollama available', () => {
    assert.equal(shouldUseOllama('check in for my flight', true, {}), false);
  });

  test('returns false when playwright MCP server needed', () => {
    assert.equal(shouldUseOllama('browse google', true, { playwright: {} }), false);
  });

  test('returns false for skill commands (slash prefix)', () => {
    assert.equal(shouldUseOllama('/send-email hello', true, {}), false);
  });

  test('returns true for simple greeting when OLLAMA_DEFAULT=true', () => {
    process.env.OLLAMA_DEFAULT = 'true';
    const result = shouldUseOllama('hello how are you today', true, {});
    assert.equal(result, true);
    delete process.env.OLLAMA_DEFAULT;
  });

  test('returns true for simple greeting pattern', () => {
    delete process.env.OLLAMA_DEFAULT;
    assert.equal(shouldUseOllama('hello', true, {}), true);
  });

  test('returns true for "hi" greeting', () => {
    assert.equal(shouldUseOllama('hi', true, {}), true);
  });

  test('returns true for translate pattern', () => {
    assert.equal(shouldUseOllama('translate this to malay', true, {}), true);
  });

  test('returns true for calculate pattern', () => {
    assert.equal(shouldUseOllama('calculate 100 * 25', true, {}), true);
  });

  test('returns true for thanks', () => {
    assert.equal(shouldUseOllama('thanks', true, {}), true);
  });

  test('returns false for non-simple message without OLLAMA_DEFAULT', () => {
    delete process.env.OLLAMA_DEFAULT;
    assert.equal(shouldUseOllama('write me a detailed business plan', true, {}), false);
  });

  test('OLLAMA_DEFAULT=false does not force Ollama', () => {
    process.env.OLLAMA_DEFAULT = 'false';
    assert.equal(shouldUseOllama('write a detailed report', true, {}), false);
    delete process.env.OLLAMA_DEFAULT;
  });
});
