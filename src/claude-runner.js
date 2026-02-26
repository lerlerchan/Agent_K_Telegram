const { execSync } = require('child_process');

const runClaude = async (message, sessionId = null) => {
  const cwd = process.env.WORKSPACE_DIR || process.cwd();
  const args = ['claude', '-p', '--output-format', 'json', '--dangerously-skip-permissions'];

  if (sessionId) args.push('--resume', sessionId);
  args.push(`"${message.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);

  try {
    const out = execSync(args.join(' '), {
      cwd, encoding: 'utf8', shell: true, timeout: 300000, maxBuffer: 10 * 1024 * 1024, windowsHide: true
    });
    try {
      const r = JSON.parse(out);
      return { response: r.result || r.message || r.text || out, sessionId: r.session_id || null };
    } catch {
      return { response: out || 'Done', sessionId: null };
    }
  } catch (e) {
    throw new Error(e.stderr || e.message || 'Claude failed');
  }
};

module.exports = { runClaude };
