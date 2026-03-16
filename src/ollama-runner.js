const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.resolve(__dirname, '..', 'logs', 'activity');

function logToFile(level, msg) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const time = new Date().toISOString().slice(11, 23);
    const line = `[${time}] [${level}] ${msg}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${date}.log`), line);
  } catch { /* ignore logging errors */ }
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODELS = (process.env.OLLAMA_MODELS || process.env.OLLAMA_MODEL || 'llama3.2')
  .split(',').map(m => m.trim()).filter(Boolean);

let ollamaAvailable = null; // cached availability check
let cachedModelNames = null; // cached list of installed model names

/**
 * Fetch installed model names from /api/tags
 */
const getAvailableModels = async () => {
  if (cachedModelNames !== null) return cachedModelNames;

  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_BASE_URL}/api/tags`);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: 3000 }, (res) => {
      if (res.statusCode !== 200) {
        cachedModelNames = [];
        resolve([]);
        return;
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          cachedModelNames = (data.models || []).map(m => m.name);
          resolve(cachedModelNames);
        } catch {
          cachedModelNames = [];
          resolve([]);
        }
      });
    });

    req.on('timeout', () => { req.abort(); cachedModelNames = []; resolve([]); });
    req.on('error', () => { cachedModelNames = []; resolve([]); });
  });
};

/**
 * Check if Ollama is available and reachable
 */
const isOllamaAvailable = async () => {
  if (ollamaAvailable !== null) return ollamaAvailable;

  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_BASE_URL}/api/tags`);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: 3000 }, (res) => {
      ollamaAvailable = res.statusCode === 200;
      resolve(ollamaAvailable);
    });

    req.on('timeout', () => {
      req.abort();
      ollamaAvailable = false;
      resolve(false);
    });

    req.on('error', () => {
      ollamaAvailable = false;
      resolve(false);
    });
  });
};

/**
 * Run a message against a specific Ollama model
 */
const runWithModel = (model, message, { onProgress, signal } = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${OLLAMA_BASE_URL}/api/generate`);
    const client = url.protocol === 'https:' ? https : http;

    const payload = {
      model,
      prompt: message,
      stream: true,
      temperature: 0.7,
    };

    const reqOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 minute timeout
    };

    const req = client.request(url, reqOptions, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => {
          errorBody += chunk.toString();
        });
        res.on('end', () => {
          logToFile('ERROR', `Ollama [${model}] HTTP ${res.statusCode}: ${errorBody.slice(0, 200)}`);
          reject(new Error(`Ollama API error: ${res.statusCode}`));
        });
        return;
      }

      let response = '';
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.response) {
              response += json.response;
              if (onProgress) {
                onProgress({ type: 'text', text: json.response });
              }
            }
          } catch (e) {
            // Invalid JSON, skip
          }
        }
      });

      res.on('end', () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.response) {
              response += json.response;
            }
          } catch (e) {
            // Invalid JSON
          }
        }

        logToFile('INFO', `Ollama [${model}] response: ${response.slice(0, 200)}`);
        resolve({
          response: response.trim(),
          model,
        });
      });
    });

    req.on('error', (err) => {
      logToFile('ERROR', `Ollama [${model}] request failed: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      req.abort();
      reject(new Error('Ollama request timeout'));
    });

    // Handle signal abort (user cancelled)
    if (signal) {
      signal.addEventListener('abort', () => {
        req.abort();
        reject(new Error('Request cancelled'));
      });
    }

    req.write(JSON.stringify(payload));
    req.end();
  });
};

/**
 * Run a message against Ollama, trying models in priority order with fallback
 */
const runOllama = async (message, { onProgress, signal } = {}) => {
  const available = await getAvailableModels();

  // Filter to installed models; if none match, try all in order anyway
  let candidates = OLLAMA_MODELS.filter(m => available.includes(m));
  if (candidates.length === 0) {
    logToFile('WARN', `None of [${OLLAMA_MODELS.join(', ')}] found in /api/tags — trying first model anyway`);
    candidates = [OLLAMA_MODELS[0]];
  }

  logToFile('INFO', `Ollama model priority: ${candidates.join(' → ')}`);

  for (const model of candidates) {
    try {
      return await runWithModel(model, message, { onProgress, signal });
    } catch (err) {
      if (signal?.aborted) throw err; // user cancelled — don't retry
      logToFile('WARN', `Model ${model} failed: ${err.message}, trying next...`);
    }
  }

  throw new Error('All Ollama models failed');
};

module.exports = {
  isOllamaAvailable,
  getAvailableModels,
  runOllama,
};
