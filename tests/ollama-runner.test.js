/**
 * Tests for src/ollama-runner.js
 * Uses node:test + node:assert + a mock HTTP server (no extra deps)
 */
'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ── helpers ────────────────────────────────────────────────────────────────

/** Clear require-cache for a module so each test group gets a fresh instance */
function freshRequire(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

/** Spin up an HTTP server on a random port, return { server, port, close } */
function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

/** Produce an NDJSON streaming Ollama-style response */
function ollamaStreamResponse(tokens) {
  return tokens
    .map((t, i) => JSON.stringify({ response: t, done: i === tokens.length - 1 }))
    .join('\n') + '\n';
}

// ── isOllamaAvailable ───────────────────────────────────────────────────────

describe('isOllamaAvailable', () => {
  test('returns true when /api/tags responds 200', async () => {
    const mock = await createMockServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200);
        res.end(JSON.stringify({ models: [] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { isOllamaAvailable } = freshRequire('../src/ollama-runner');

    const result = await isOllamaAvailable();
    assert.equal(result, true);
    await mock.close();
  });

  test('returns false when /api/tags responds non-200', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(503);
      res.end('unavailable');
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { isOllamaAvailable } = freshRequire('../src/ollama-runner');

    const result = await isOllamaAvailable();
    assert.equal(result, false);
    await mock.close();
  });

  test('returns false when connection is refused', async () => {
    // Point at a port where nothing is listening
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:19999';
    const { isOllamaAvailable } = freshRequire('../src/ollama-runner');

    const result = await isOllamaAvailable();
    assert.equal(result, false);
  });

  test('caches result — second call does not hit the server', async () => {
    let hits = 0;
    const mock = await createMockServer((req, res) => {
      hits++;
      res.writeHead(200);
      res.end(JSON.stringify({ models: [] }));
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { isOllamaAvailable } = freshRequire('../src/ollama-runner');

    await isOllamaAvailable();
    await isOllamaAvailable(); // second call — cached

    assert.equal(hits, 1, 'server should only be hit once due to caching');
    await mock.close();
  });
});

// ── runOllama ───────────────────────────────────────────────────────────────

describe('runOllama', () => {
  test('resolves with concatenated streaming tokens', async () => {
    const tokens = ['Hello', ', ', 'world', '!'];
    const mock = await createMockServer((req, res) => {
      res.writeHead(200);
      res.end(ollamaStreamResponse(tokens));
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    const result = await runOllama('test prompt');
    assert.equal(result.response, 'Hello, world!');
    assert.ok(typeof result.model === 'string', 'model should be a string');
    await mock.close();
  });

  test('calls onProgress for each token', async () => {
    const tokens = ['A', 'B', 'C'];
    const mock = await createMockServer((req, res) => {
      res.writeHead(200);
      res.end(ollamaStreamResponse(tokens));
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    const received = [];
    await runOllama('test', {
      onProgress: ({ text }) => received.push(text),
    });
    assert.deepEqual(received, tokens);
    await mock.close();
  });

  test('rejects when server returns non-200 status', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    await assert.rejects(
      () => runOllama('test'),
      (err) => {
        assert.match(err.message, /500/);
        return true;
      }
    );
    await mock.close();
  });

  test('rejects when request is aborted via AbortController', async () => {
    const mock = await createMockServer((req, res) => {
      // Hang — never respond
      req.on('close', () => {});
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    const controller = new AbortController();
    const promise = runOllama('test', { signal: controller.signal });

    // Abort after a short tick
    setImmediate(() => controller.abort());

    await assert.rejects(promise, /cancelled|abort/i);
    await mock.close();
  });

  test('handles malformed JSON lines gracefully (skips them)', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(200);
      // Mix valid and invalid JSON lines
      res.end('{"response":"good"}\nnot-json\n{"response":" data"}\n');
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    const result = await runOllama('test');
    assert.equal(result.response, 'good data');
    await mock.close();
  });

  test('handles empty response tokens (lines with no response key)', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(200);
      res.end('{"done":false}\n{"response":"hi","done":true}\n');
    });

    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mock.port}`;
    const { runOllama } = freshRequire('../src/ollama-runner');

    const result = await runOllama('test');
    assert.equal(result.response, 'hi');
    await mock.close();
  });
});
