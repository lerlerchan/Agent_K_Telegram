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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
let ollamaAvailable = null; // cached availability check

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
 * Run a message against Ollama's /api/generate endpoint
 */
const runOllama = (message, { onProgress, signal } = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${OLLAMA_BASE_URL}/api/generate`);
    const client = url.protocol === 'https:' ? https : http;

    const payload = {
      model: OLLAMA_MODEL,
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
          logToFile('ERROR', `Ollama HTTP ${res.statusCode}: ${errorBody.slice(0, 200)}`);
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

        logToFile('INFO', `Ollama response: ${response.slice(0, 200)}`);
        resolve({
          response: response.trim(),
          model: OLLAMA_MODEL,
        });
      });
    });

    req.on('error', (err) => {
      logToFile('ERROR', `Ollama request failed: ${err.message}`);
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

module.exports = {
  isOllamaAvailable,
  runOllama,
};
