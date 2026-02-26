const { spawn } = require('child_process');
const path = require('path');

// MCP server configs — only loaded when message matches keywords
const MCP_SERVERS = {
  playwright: {
    keywords: ['browse', 'website', 'webpage', 'search', 'google', 'screenshot', 'scrape', 'url', 'http', 'open page', 'navigate'],
    config: {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--browser', 'chromium',
        ...(process.env.PLAYWRIGHT_CHROME_PATH ? ['--executable-path', process.env.PLAYWRIGHT_CHROME_PATH] : [])]
    }
  },
  'chrome-devtools': {
    keywords: ['devtools', 'debug page', 'inspect', 'performance trace'],
    config: {
      command: 'npx',
      args: ['chrome-devtools-mcp', '--headless']
    }
  },
  gmail: {
    keywords: ['email', 'gmail', 'mail', 'inbox', 'send email'],
    config: {
      command: 'npx',
      args: ['@gongrzhe/server-gmail-autoauth-mcp']
    }
  }
};

// Detect which MCP servers are needed based on message content
function detectMcpServers(message) {
  const lower = message.toLowerCase();
  const needed = {};
  for (const [name, server] of Object.entries(MCP_SERVERS)) {
    if (server.keywords.some(kw => lower.includes(kw))) {
      needed[name] = server.config;
    }
  }
  return needed;
}

const runClaude = (message, sessionId = null, { onProgress, signal } = {}) => {
  return new Promise((resolve, reject) => {
    const cwd = process.env.WORKSPACE_DIR || process.cwd();
    const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions', '--model', 'sonnet'];

    // Smart MCP: only load servers matching the message
    const mcpServers = detectMcpServers(message);
    const serverCount = Object.keys(mcpServers).length;

    if (serverCount > 0) {
      const mcpConfig = JSON.stringify({ mcpServers: mcpServers });
      args.push('--mcp-config', mcpConfig, '--strict-mcp-config');
    } else {
      args.push('--strict-mcp-config'); // no MCP servers = fast mode
    }

    if (sessionId) args.push('--resume', sessionId);
    args.push(message);

    const env = { ...process.env, HOME: process.env.HOME };
    delete env.CLAUDECODE;
    delete env.TERM_PROGRAM;
    env.CI = '1';

    if (serverCount > 0) {
      console.log(`  ⚙️  Loading MCP: ${Object.keys(mcpServers).join(', ')}`);
    } else {
      console.log(`  ⚡ Fast mode (no MCP)`);
    }

    const proc = spawn('claude', args, {
      cwd, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // 30 minute hard timeout
    const timeout = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
      reject(new Error('Claude timed out after 30 minutes'));
    }, 30 * 60 * 1000);

    // Support cancellation via AbortSignal
    if (signal) {
      signal.addEventListener('abort', () => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 3000);
        reject(new Error('Request cancelled'));
      }, { once: true });
    }

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (onProgress) {
        const text = chunk.toString().trim();
        if (text) onProgress(text);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) return;

      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(stderr || `Claude exited with code ${code}`));
      }

      try {
        const r = JSON.parse(stdout);
        // Use nullish checks — empty string "" is a valid (but empty) result, don't fall through to raw JSON
        const text = (r.result != null && r.result !== '') ? r.result
          : (r.message != null && r.message !== '') ? r.message
          : (r.text != null && r.text !== '') ? r.text
          : null;
        if (!text) {
          // Claude returned empty result — check for errors
          const denied = r.permissiondenials?.map(d => d.toolname).join(', ');
          const fallback = denied ? `⚠️ Claude couldn't complete — permission denied for: ${denied}` : '⚠️ Claude returned an empty response. Try again.';
          resolve({ response: fallback, sessionId: r.session_id || null });
        } else {
          resolve({ response: text, sessionId: r.session_id || null });
        }
      } catch {
        resolve({ response: stdout.trim() || 'Done', sessionId: null });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      if (!killed) reject(new Error(err.message));
    });
  });
};

module.exports = { runClaude };
