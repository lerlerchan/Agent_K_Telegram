#!/usr/bin/env node
/**
 * Saturday GitHub Repo Arranger + Wiki Synthesizer
 * 1. Scans 00-inbox/ for GitHub link notes → tags + moves to 04-resources/github/
 * 2. Synthesizes all 04-resources/github/ notes into 02-knowledge/GitHub-Wiki.md
 *    using live GitHub API data (stars, description, language, archived status)
 * Run: node arrange-github.js [--dry-run] [--wiki-only]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────

const VAULT    = '/home/lerler/ObsidianVault';
const INBOX    = path.join(VAULT, '00-inbox');
const DEST_DIR = path.join(VAULT, '04-resources/github');
const WIKI_OUT = path.join(VAULT, '02-knowledge/GitHub-Wiki.md');
const DRY_RUN  = process.argv.includes('--dry-run');
const WIKI_ONLY = process.argv.includes('--wiki-only');

// ── Telegram ─────────────────────────────────────────────────────────────────

function loadEnvToken() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
    const token  = (raw.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m)    || [])[1]?.trim();
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

// ── Category rules ────────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  { tags: ['mcp', 'ai-tools'],        pattern: /mcp[-_]|[-_]mcp|mcp$|mcp.server|anysearch|token.saver/i },
  { tags: ['claude-code', 'ai-tools'], pattern: /free.claude|claude.code|cc.token/i },
  { tags: ['ai-agents', 'ai-tools'],  pattern: /agent.skill|professor.synapse|light.skill|skillspector|llm.council/i },
  { tags: ['llm', 'ai-tools'],        pattern: /vllm|exo.?ai|exo.?explore|exo.?cluster|mimo.?code|llm.council|karpathy/i },
  { tags: ['security'],               pattern: /cloud.?sec|awesome.?cloud|tracecat|vaultwarden/i },
  { tags: ['self-hosted'],            pattern: /syncthing|vaultwarden|paperless|karakeep|stirling|ghost/i },
  { tags: ['productivity'],           pattern: /paperless|karakeep|stirling.?pdf|ghost/i },
  { tags: ['image-gen', 'ai-tools'],  pattern: /t2i|text.?to.?image|stable.?diff|diffusion|minit2i/i },
  { tags: ['learning'],               pattern: /ai.?engineer.*scratch|engineering.*coach|from.?scratch|tutorial|bootcamp|course/i },
  { tags: ['ai-tools'],               pattern: /ai.?engineer|ai.?coach|microsoft\/ai/i },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanGithubUrl(raw) {
  const match = raw.match(/https:\/\/github\.com\/[^\s?#"'<>]+/);
  if (!match) return null;
  const clean = match[0].replace(/\/$/, '');
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
  if (/^url:\s*"https?:\/\//m.test(fm)) return fm;
  return fm.replace(/^url:\s*""?\s*$/m, `url: "${url}"`);
}

function classifyRepo(repoSlug) {
  const tags = new Set(['github-repo']);
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(repoSlug)) rule.tags.forEach(t => tags.add(t));
  }
  return [...tags];
}

// Extract primary category from tags array (first non-generic tag)
const GENERIC_TAGS = new Set(['knowledge', 'github-repo', 'ai-tools']);
function primaryCategory(tags) {
  for (const t of tags) {
    if (!GENERIC_TAGS.has(t)) return t;
  }
  return tags.includes('ai-tools') ? 'ai-tools' : 'uncategorized';
}

// Pull first meaningful sentence from note body (skip URLs and blank lines)
function extractNotes(body) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^https?:\/\//.test(line)) continue;
    if (/^#+\s/.test(line)) continue;
    if (line.length < 10) continue;
    // Truncate to 80 chars
    return line.length > 80 ? line.slice(0, 77) + '…' : line;
  }
  return '';
}

// ── Arrange pass ──────────────────────────────────────────────────────────────

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  const { fm, body } = parsed;

  const fullText = fm + body;
  const cleanUrl = cleanGithubUrl(fullText);
  if (!cleanUrl) return null;
  if (filePath.startsWith(DEST_DIR)) return null;
  if (!filePath.startsWith(INBOX)) return null;

  const repoMatch = cleanUrl.match(/github\.com\/([^/]+\/[^/\s]+)/);
  const repoSlug = repoMatch ? repoMatch[1] : cleanUrl;
  const actions = [];
  let newFm = fm;

  if (!/^url:\s*"https?:\/\//m.test(fm)) {
    newFm = setUrlField(newFm, cleanUrl);
    actions.push(`url → ${cleanUrl}`);
  }

  const categoryTags = classifyRepo(repoSlug + ' ' + body + ' ' + fm);
  const missingTags = categoryTags.filter(t => !hasTag(newFm, t));
  if (missingTags.length > 0) {
    newFm = addTags(newFm, missingTags);
    actions.push(`tag [${missingTags.join(', ')}]`);
  }
  actions.push(`move → 04-resources/github/`);

  if (!DRY_RUN) {
    const newContent = `---\n${newFm}\n---${body}`;
    fs.writeFileSync(filePath, newContent, 'utf8');
    if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.renameSync(filePath, path.join(DEST_DIR, path.basename(filePath)));
  }

  return { file: path.basename(filePath), repo: repoSlug, actions };
}

// ── GitHub API ────────────────────────────────────────────────────────────────

function loadGithubPat() {
  try {
    return fs.readFileSync(path.join(process.env.HOME, '.claude/credentials/github-pat'), 'utf8').trim();
  } catch { return null; }
}

function fetchRepoData(owner, repo, pat) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Agent-K-WikiSynth/1.0',
        'Accept': 'application/vnd.github+json',
        ...(pat ? { 'Authorization': `Bearer ${pat}` } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ ok: true, data: JSON.parse(data) }); }
          catch { resolve({ ok: false }); }
        } else {
          resolve({ ok: false, status: res.statusCode });
        }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── README enrichment ─────────────────────────────────────────────────────────

function fetchRaw(url, pat) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'Agent-K-WikiSynth/1.0',
        ...(pat ? { 'Authorization': `Bearer ${pat}` } : {}),
      },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function fetchReadme(owner, repo, pat) {
  for (const branch of ['main', 'master']) {
    const raw = await fetchRaw(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`, pat
    );
    if (raw) return raw;
  }
  return null;
}

function cleanReadme(raw) {
  return raw
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '')  // badge links
    .replace(/!\[.*?\]\(.*?\)/g, '')               // images
    .replace(/^\s*<[^>]+>\s*$/gm, '')              // bare HTML tag lines
    .replace(/<!--[\s\S]*?-->/g, '')               // HTML comments
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2500);
}

async function enrichWithReadme(arranged, pat) {
  if (arranged.length === 0) return;
  console.log(`[readme] Fetching README for ${arranged.length} new repo(s)...`);
  for (const r of arranged) {
    const [owner, repo] = r.repo.split('/');
    if (!owner || !repo) continue;

    const filePath = path.join(DEST_DIR, r.file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('## README')) {
      console.log(`  [readme] ${r.repo} — already enriched, skipping`);
      continue;
    }

    const raw = await fetchReadme(owner, repo, pat);
    if (!raw) { console.log(`  [readme] ${r.repo} — README not found`); continue; }

    const excerpt = cleanReadme(raw);
    fs.writeFileSync(filePath, content.trimEnd() + `\n\n## README\n\n${excerpt}\n`, 'utf8');
    console.log(`  [readme] ${r.repo} — ${excerpt.length} chars appended`);
    await sleep(150);
  }
}

// ── Wiki synthesis ────────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'ai-agents', 'llm', 'mcp', 'claude-code', 'image-gen',
  'ai-tools', 'self-hosted', 'productivity', 'security', 'learning', 'uncategorized',
];

const CATEGORY_LABELS = {
  'ai-agents':   '🤖 AI Agents',
  'llm':         '🧠 LLM / Inference',
  'mcp':         '🔌 MCP Servers',
  'claude-code': '⚡ Claude Code',
  'image-gen':   '🎨 Image Generation',
  'ai-tools':    '🛠️ AI Tools',
  'self-hosted': '🏠 Self-Hosted',
  'productivity':'📋 Productivity',
  'security':    '🔒 Security',
  'learning':    '📚 Learning',
  'uncategorized': '📦 Uncategorized',
};

async function synthesizeWiki() {
  console.log('\n[wiki] Synthesizing GitHub-Wiki.md...');
  const pat = loadGithubPat();
  if (!pat) console.warn('[wiki] No GitHub PAT — API rate limit will be low (60 req/hr)');

  // 1. Read all notes from 04-resources/github/
  if (!fs.existsSync(DEST_DIR)) { console.log('[wiki] No github notes dir, skipping.'); return 0; }
  const files = fs.readdirSync(DEST_DIR).filter(f => f.endsWith('.md'));
  console.log(`[wiki] ${files.length} notes found`);

  // 2. Parse each note
  const entries = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(DEST_DIR, f), 'utf8');
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;
    const { fm, body } = parsed;

    // Extract URL from frontmatter url field only (already cleaned by arrange pass)
    const urlRaw = (fm.match(/^url:\s*"(https?:\/\/github\.com\/[^"]+)"/m) || [])[1];
    const urlMatch = urlRaw ? [null, cleanGithubUrl(urlRaw) || urlRaw] : null;
    if (!urlMatch) {
      // Try body as fallback (for older notes)
      const bodyUrl = cleanGithubUrl(body);
      if (!bodyUrl) continue;
      const repoMatch = bodyUrl.match(/github\.com\/([^/\s]+\/[^/\s]+)/);
      if (!repoMatch) continue;
      entries.push({ file: f, url: bodyUrl, slug: repoMatch[1], fm, body });
      continue;
    }
    const url = urlMatch[1];
    const repoMatch = url.match(/github\.com\/([^/\s]+\/[^/\s]+)/);
    if (!repoMatch) continue;

    // Extract tags
    const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);
    const tags = tagsMatch
      ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean)
      : [];

    entries.push({ file: f, url, slug: repoMatch[1], tags, fm, body });
  }

  // 3. Fetch live data from GitHub API
  console.log(`[wiki] Fetching GitHub API for ${entries.length} repos...`);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const [owner, repo] = e.slug.split('/');
    const result = await fetchRepoData(owner, repo, pat);
    if (result.ok) {
      const d = result.data;
      e.stars       = d.stargazers_count;
      e.description = d.description || '';
      e.language    = d.language || '';
      e.archived    = d.archived || false;
    } else {
      e.stars       = -1;
      e.description = '';
      e.language    = '';
      e.archived    = false;
      e.unavailable = true;
    }
    e.notes = extractNotes(e.body);
    if ((i + 1) % 10 === 0) console.log(`[wiki]   ${i + 1}/${entries.length}`);
    await sleep(60); // ~1000 req/min well under 5000/hr limit
  }

  // 3b. Dedup by slug (keep highest-star entry, or first if unavailable)
  const seen = new Map();
  for (const e of entries) {
    const key = e.slug.toLowerCase();
    const prev = seen.get(key);
    if (!prev || (e.stars ?? -1) > (prev.stars ?? -1)) seen.set(key, e);
  }
  const deduped = [...seen.values()];
  console.log(`[wiki] After dedup: ${deduped.length} unique repos (${entries.length - deduped.length} duplicates removed)`);

  // 4. Group by category
  const groups = {};
  for (const e of deduped) {
    const cat = primaryCategory(e.tags || []);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(e);
  }
  // Sort each group by stars desc
  for (const cat of Object.keys(groups)) {
    groups[cat].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
  }

  // 5. Build markdown
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric' });
  const lines = [
    '---',
    'title: GitHub Links Wiki',
    `updated: ${dateStr}`,
    'tags: [wiki, github-repo]',
    '---',
    '',
    '# GitHub Links Wiki',
    '',
    `> Auto-generated ${dateStr} from ${entries.length} saved repos. Updated every Saturday.`,
    '',
  ];

  let totalRows = 0;
  const orderedCats = [
    ...CATEGORY_ORDER.filter(c => groups[c]),
    ...Object.keys(groups).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  for (const cat of orderedCats) {
    const label = CATEGORY_LABELS[cat] || cat;
    const rows = groups[cat];
    lines.push(`## ${label}`, '');
    lines.push('| Repo | ⭐ | Lang | Description | Notes |');
    lines.push('|------|----|------|-------------|-------|');
    for (const e of rows) {
      const [owner, repo] = e.slug.split('/');
      const repoLink = `[${repo}](${e.url})`;
      const stars = e.unavailable ? '⚠️' : e.archived ? `~~${e.stars}~~` : String(e.stars ?? '?');
      const lang  = e.language  || '';
      const desc  = (e.description || '').replace(/\|/g, '\\|').slice(0, 80);
      const notes = (e.notes || '').replace(/\|/g, '\\|');
      lines.push(`| ${repoLink} | ${stars} | ${lang} | ${desc} | ${notes} |`);
      totalRows++;
    }
    lines.push('');
  }

  lines.push(`---`, `*${totalRows} repos · updated ${dateStr}*`);

  // 6. Write
  if (!DRY_RUN) {
    fs.writeFileSync(WIKI_OUT, lines.join('\n'), 'utf8');
    console.log(`[wiki] Written → ${WIKI_OUT} (${totalRows} repos)`);
  } else {
    console.log(`[wiki] DRY RUN — would write ${totalRows} rows to ${WIKI_OUT}`);
  }

  return totalRows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[arrange-github] ${DRY_RUN ? 'DRY RUN — ' : ''}${new Date().toISOString()}`);

  let arranged = 0;

  if (!WIKI_ONLY) {
    if (!fs.existsSync(INBOX)) { console.error('Inbox not found'); process.exit(1); }
    const files = fs.readdirSync(INBOX)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(INBOX, f));

    const results = files.map(processFile).filter(Boolean);
    arranged = results.length;

    if (results.length === 0) {
      console.log('Nothing to arrange.');
    } else {
      for (const r of results) {
        console.log(`  ${r.repo}`);
        for (const a of r.actions) console.log(`    → ${a}`);
      }
      console.log(`\nArranged: ${results.length} repo(s).`);
    }

    const pat = loadGithubPat();
    if (!DRY_RUN) await enrichWithReadme(results, pat);
  }

  const wikiRows = await synthesizeWiki();

  if (!DRY_RUN) {
    const date = new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short' });
    let msg = `📦 <b>GitHub Arrange (Sat) — ${date}</b>\n`;
    if (!WIKI_ONLY) msg += `• Arranged: ${arranged} new repo(s)\n`;
    msg += `• Wiki: ${wikiRows} repos → GitHub-Wiki.md\n`;
    msg += `✅ Done`;
    sendTelegram(msg);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
