#!/usr/bin/env node
/**
 * Saturday GitHub Repo Arranger
 * Scans 00-inbox/ for GitHub link notes.
 * - Extracts clean GitHub URL into `url` frontmatter field
 * - Tags with `github-repo` + category tags
 * - Moves to 04-resources/github/
 * Run: node arrange-github.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvToken() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
    const token = (raw.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m) || [])[1]?.trim();
    const chatId = (raw.match(/^TELEGRAM_GROUP_CHAT_ID=(.+)$/m) || [])[1]?.trim();
    return { token, chatId };
  } catch { return { token: null, chatId: null }; }
}

function sendTelegram(text) {
  const { token, chatId } = loadEnvToken();
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

const VAULT = '/home/lerler/ObsidianVault';
const INBOX = path.join(VAULT, '00-inbox');
const DEST_DIR = path.join(VAULT, '04-resources/github');
const DRY_RUN = process.argv.includes('--dry-run');

// Category rules: matched against "owner/repo" slug (lowercased)
// Order: more specific rules first
const CATEGORY_RULES = [
  // MCP servers
  { tags: ['mcp', 'ai-tools'],     pattern: /mcp[-_]|[-_]mcp|mcp$|mcp.server|anysearch|token.saver/i },
  // Claude Code specific
  { tags: ['claude-code', 'ai-tools'], pattern: /free.claude|claude.code|cc.token/i },
  // AI agents / prompting
  { tags: ['ai-agents', 'ai-tools'], pattern: /agent.skill|professor.synapse|light.skill|skillspector|llm.council/i },
  // LLM inference / models
  { tags: ['llm', 'ai-tools'],     pattern: /vllm|exo.?ai|exo.?explore|exo.?cluster|mimo.?code|llm.council|karpathy/i },
  // Security
  { tags: ['security'],            pattern: /cloud.?sec|awesome.?cloud|tracecat|vaultwarden/i },
  // Self-hosted services
  { tags: ['self-hosted'],         pattern: /syncthing|vaultwarden|paperless|karakeep|stirling|ghost/i },
  // Productivity tools
  { tags: ['productivity'],        pattern: /paperless|karakeep|stirling.?pdf|ghost/i },
  // Image generation
  { tags: ['image-gen', 'ai-tools'], pattern: /t2i|text.?to.?image|stable.?diff|diffusion|minit2i/i },
  // Learning / education
  { tags: ['learning'],            pattern: /ai.?engineer.*scratch|engineering.*coach|from.?scratch|tutorial|bootcamp|course/i },
  // General AI tools (fallback)
  { tags: ['ai-tools'],            pattern: /ai.?engineer|ai.?coach|microsoft\/ai/i },
];

// Extract clean GitHub URL — strip fbclid, tracking params, trailing junk
function cleanGithubUrl(raw) {
  // Exclude quotes, tracking params, angle brackets from URL
  const match = raw.match(/https:\/\/github\.com\/[^\s?#"'<>]+/);
  if (!match) return null;
  // Keep only up to owner/repo (strip /blob/... /tree/... subpaths)
  const clean = match[0].replace(/\/$/, '');
  // Normalize: keep up to 2 path segments after github.com/
  const parts = clean.replace('https://github.com/', '').split('/');
  if (parts.length >= 2) return `https://github.com/${parts[0]}/${parts[1]}`;
  return clean;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return { fm: match[1], body: content.slice(match[0].length) };
}

function hasTag(fm, tag) {
  // Only check inside the tags: [...] array, not whole frontmatter (avoids URL false matches)
  const tagsLine = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (!tagsLine) return false;
  return tagsLine[1].split(',').map(t => t.trim().replace(/['"]/g, '')).includes(tag);
}

function addTags(fm, newTags) {
  const tagsMatch = fm.match(/^(tags:\s*\[)([^\]]*)\]/m);
  if (tagsMatch) {
    const existing = tagsMatch[2].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean);
    const toAdd = newTags.filter(t => !existing.includes(t));
    if (toAdd.length === 0) return fm;
    return fm.replace(/^(tags:\s*\[)[^\]]*/m, `$1${[...existing, ...toAdd].join(', ')}`);
  }
  return fm + `\ntags: [${newTags.join(', ')}]`;
}

function setUrlField(fm, url) {
  // Already has non-empty url
  if (/^url:\s*"https?:\/\//m.test(fm)) return fm;
  return fm.replace(/^url:\s*""?\s*$/m, `url: "${url}"`);
}

function classifyRepo(repoSlug) {
  const tags = new Set(['github-repo']);
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(repoSlug)) {
      rule.tags.forEach(t => tags.add(t));
    }
  }
  return [...tags];
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const { fm, body } = parsed;

  // Only process notes that contain a github.com URL
  const fullText = fm + body;
  const cleanUrl = cleanGithubUrl(fullText);
  if (!cleanUrl) return null;

  // Skip if already in destination
  if (filePath.startsWith(DEST_DIR)) return null;
  // Only move from inbox
  if (!filePath.startsWith(INBOX)) return null;

  // Extract repo slug: owner/repo from URL
  const repoMatch = cleanUrl.match(/github\.com\/([^/]+\/[^/\s]+)/);
  const repoSlug = repoMatch ? repoMatch[1] : cleanUrl;

  const actions = [];
  let newFm = fm;

  // 1. Set clean url in frontmatter
  if (!/^url:\s*"https?:\/\//m.test(fm)) {
    newFm = setUrlField(newFm, cleanUrl);
    actions.push(`url → ${cleanUrl}`);
  }

  // 2. Apply tags
  const categoryTags = classifyRepo(repoSlug + ' ' + body + ' ' + fm);
  const missingTags = categoryTags.filter(t => !hasTag(newFm, t));
  if (missingTags.length > 0) {
    newFm = addTags(newFm, missingTags);
    actions.push(`tag [${missingTags.join(', ')}]`);
  }

  // 3. Move to 04-resources/github/
  actions.push(`move → 04-resources/github/`);

  if (!DRY_RUN) {
    const newContent = `---\n${newFm}\n---${body}`;
    fs.writeFileSync(filePath, newContent, 'utf8');
    if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.renameSync(filePath, path.join(DEST_DIR, path.basename(filePath)));
  }

  return {
    file: path.basename(filePath),
    repo: repoSlug,
    actions,
  };
}

function main() {
  console.log(`[arrange-github] ${DRY_RUN ? 'DRY RUN — ' : ''}${new Date().toISOString()}`);

  if (!fs.existsSync(INBOX)) { console.error('Inbox not found'); process.exit(1); }

  const files = fs.readdirSync(INBOX)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(INBOX, f));

  const results = files.map(processFile).filter(Boolean);

  if (results.length === 0) {
    console.log('Nothing to arrange.');
    if (!DRY_RUN) sendTelegram('📦 <b>GitHub Arrange (Sat)</b>\n• Nothing to arrange\n✅ Done');
    return;
  }

  for (const r of results) {
    console.log(`  ${r.repo}`);
    for (const a of r.actions) console.log(`    → ${a}`);
  }
  console.log(`\nDone. ${results.length} repo(s) processed.`);

  if (!DRY_RUN) {
    const date = new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short' });
    let msg = `📦 <b>GitHub Arrange (Sat) — ${date}</b>\n`;
    msg += `• Repos processed: ${results.length}\n`;
    msg += `✅ Done`;
    sendTelegram(msg);
  }
}

main();
