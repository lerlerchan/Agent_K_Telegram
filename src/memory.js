const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.resolve(process.env.HOME, '.claude/projects/-home-lerler-github-Agent-K-Telegram/memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const CLAUDE_MD = path.resolve(process.env.HOME, '.claude/CLAUDE.md');

// Load MEMORY.md content (curated learnings)
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return fs.readFileSync(MEMORY_FILE, 'utf8').trim();
    }
  } catch { /* ignore */ }
  return '';
}

// Load today's daily log (session continuity)
function loadDailyLog() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayFile = path.join(DAILY_DIR, `${today}.md`);
    if (fs.existsSync(todayFile)) {
      return fs.readFileSync(todayFile, 'utf8').trim();
    }
    // Also check yesterday's log for context
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdayFile = path.join(DAILY_DIR, `${yesterday}.md`);
    if (fs.existsSync(yesterdayFile)) {
      return fs.readFileSync(yesterdayFile, 'utf8').trim();
    }
  } catch { /* ignore */ }
  return '';
}

// Load global CLAUDE.md (Atlas identity/soul)
function loadIdentity() {
  try {
    if (fs.existsSync(CLAUDE_MD)) {
      return fs.readFileSync(CLAUDE_MD, 'utf8').trim();
    }
  } catch { /* ignore */ }
  return '';
}

// Build the full system context for Agent K's Claude process
function buildSystemContext() {
  const parts = [];

  const identity = loadIdentity();
  if (identity) {
    parts.push(identity);
  }

  const memory = loadMemory();
  if (memory) {
    parts.push(`# Persistent Memory\n${memory}`);
  }

  const daily = loadDailyLog();
  if (daily) {
    parts.push(`# Today's Session Log\n${daily}`);
  }

  // Add current date (MYT)
  const myt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  parts.push(`# Current Date\nToday is ${myt}.`);

  // Always inject available local tools so Claude knows about them
  parts.push(
    `# Available Local Tools\n` +
    `## Word / .docx generation\n` +
    `Run via Bash:\n` +
    `\`\`\`bash\n` +
    `node /home/lerler/github/Agent_K_Telegram/scripts/make-docx.js \\\n` +
    `  --title "Document Title" \\\n` +
    `  --output "$WORKSPACE_DIR/filename.docx" \\\n` +
    `  --content "Full content here. Separate paragraphs with \\n\\n. Use ## for headings."\n` +
    `\`\`\`\n` +
    `The script writes the file and prints \`[SEND_FILE: /absolute/path]\` — include that exact tag in your response so the bot delivers the file to the user.\n` +
    `Always use an absolute path for --output (use $WORKSPACE_DIR as the base).`
  );

  return parts.join('\n\n---\n\n');
}

// Read a topic file from memory on demand
function readTopicFile(filename) {
  try {
    const filePath = path.join(MEMORY_DIR, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  } catch { /* ignore */ }
  return null;
}

module.exports = { buildSystemContext, loadMemory, loadDailyLog, readTopicFile, MEMORY_DIR };
