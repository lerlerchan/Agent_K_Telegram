#!/usr/bin/env node
/**
 * LinkedIn Wiki Sync
 * Collects all linkedin-ready tagged notes + wiki/ folder from ObsidianVault,
 * regenerates GitHub wiki pages, and pushes.
 *
 * Cron: 0 16 * * 2  (Wednesday 00:00 MYT = Tuesday 16:00 UTC)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────

require('dotenv').config({ path: '/home/lerler/github/Agent_K_Telegram/.env' });

const VAULT      = '/home/lerler/ObsidianVault';
const WIKI_DIR   = path.join(VAULT, 'wiki');
const TMP_DIR    = '/tmp/agentk-wiki-sync';
const WIKI_REPO  = 'github.com/lerlerchan/Agent_K_Telegram.wiki.git';
const PAT_FILE   = '/home/lerler/.claude/credentials/github-pat';
const GIT_USER   = 'atlas-aitraining2u';
const GIT_EMAIL  = 'atlas@aitraining2u.com';
const LOG        = '/home/lerler/github/Agent_K_Telegram/logs/sync-linkedin-wiki.log';

// Tag → human-readable category
const TAG_CATEGORIES = {
  'macro-finance': 'Finance & Economy',
  'malaysia':      'Finance & Economy',
  'ai-tools':      'Technology & AI',
  'ai-agents':     'Technology & AI',
  'claude-code':   'Technology & AI',
  'developer-tools':'Technology & AI',
  'llm':           'Technology & AI',
  'self-hosted':   'Technology & AI',
  'productivity':  'Productivity & PKM',
  'pkm':           'Productivity & PKM',
  'second-brain':  'Productivity & PKM',
  'obsidian':      'Productivity & PKM',
};
const DEFAULT_CATEGORY = 'General';

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function parseFrontmatter(content) {
  const fm = { title: '', date: '', tags: [], status: 'draft' };
  const m  = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return fm;
  for (const line of m[1].split('\n')) {
    const [k, ...rest] = line.split(':');
    const key = k?.trim();
    const val = rest.join(':').trim().replace(/^["']|["']$/g, '');
    if (key === 'title') fm.title = val;
    if (key === 'date')  fm.date  = val;
    if (key === 'status') fm.status = val;
    if (key === 'tags') {
      // inline: [a, b] or multiline bullets below
      if (val.startsWith('[')) {
        fm.tags = val.slice(1, -1).split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
      }
    }
    // multiline tags: "  - tag"
    if (line.match(/^\s+-\s+(.+)/)) {
      const tag = line.match(/^\s+-\s+(.+)/)[1].trim();
      if (!fm.tags.includes(tag)) fm.tags.push(tag);
    }
  }
  return fm;
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function slugify(filepath) {
  return path.basename(filepath, '.md')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-');
}

function wikiPageName(filepath) {
  // GitHub wiki uses spaces in display but hyphens in URL; use hyphens in filename
  return slugify(filepath);
}

function pickCategory(tags) {
  for (const tag of tags) {
    if (TAG_CATEGORIES[tag]) return TAG_CATEGORIES[tag];
  }
  return DEFAULT_CATEGORY;
}

// ── Collect files ─────────────────────────────────────────────────────────────

function walkDir(dir, ext = '.md') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const skip = ['.obsidian', '.claude', 'graphify-out', 'raw', '.stfolder'];
      if (!skip.includes(entry.name)) results.push(...walkDir(full, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function collectSources() {
  const seen = new Set();
  const files = [];

  // Source 1: everything in wiki/ folder
  if (fs.existsSync(WIKI_DIR)) {
    for (const f of fs.readdirSync(WIKI_DIR)) {
      if (f.endsWith('.md') && f !== 'README.md') {
        const full = path.join(WIKI_DIR, f);
        if (!seen.has(full)) { seen.add(full); files.push(full); }
      }
    }
  }

  // Source 2: any vault note tagged linkedin-ready
  for (const filepath of walkDir(VAULT)) {
    if (seen.has(filepath)) continue;
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const fm = parseFrontmatter(content);
      if (fm.tags.includes('linkedin-ready')) {
        seen.add(filepath);
        files.push(filepath);
      }
    } catch (_) {}
  }

  return files;
}

// ── Article objects ────────────────────────────────────────────────────────────

function buildArticles(filepaths) {
  return filepaths.map(fp => {
    const raw  = fs.readFileSync(fp, 'utf8');
    const fm   = parseFrontmatter(raw);
    const body = stripFrontmatter(raw);
    const slug = wikiPageName(fp);
    const title = fm.title || slug.replace(/-/g, ' ');
    const date  = fm.date  || '';
    const category = pickCategory(fm.tags);
    return { slug, title, date, tags: fm.tags, status: fm.status, category, body, filepath: fp };
  }).sort((a, b) => (b.date > a.date ? 1 : -1)); // newest first
}

// ── Wiki page content ─────────────────────────────────────────────────────────

function renderPage(article) {
  const tagLine = article.tags.length
    ? `> **Tags:** ${article.tags.map(t => `\`${t}\``).join(' ')}\n\n`
    : '';
  return `# ${article.title}\n\n${tagLine}${article.body}\n`;
}

function renderHome(articles) {
  const byCategory = {};
  for (const a of articles) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  }

  const updated = new Date().toISOString().slice(0, 10);
  let home = `# LinkedIn Content Index\n\n`;
  home += `> Auto-generated from ObsidianVault — updated **${updated}** | ${articles.length} articles\n\n`;

  // Full sorted table
  home += `## All Articles\n\n`;
  home += `| Date | Title | Category | Tags |\n`;
  home += `|------|-------|----------|------|\n`;
  for (const a of articles) {
    const tags = a.tags.filter(t => t !== 'linkedin-ready').slice(0, 3).join(', ');
    home += `| ${a.date} | [[${a.slug}\\|${a.title}]] | ${a.category} | ${tags} |\n`;
  }
  home += '\n';

  // Category sections
  for (const [cat, items] of Object.entries(byCategory)) {
    home += `## ${cat}\n\n`;
    for (const a of items) {
      home += `- [[${a.slug}\\|${a.title}]] — ${a.date}\n`;
    }
    home += '\n';
  }

  return home;
}

// ── Local vault Home.md ───────────────────────────────────────────────────────

function writeLocalHome(articles) {
  const homePath = path.join(WIKI_DIR, 'Home.md');
  const updated  = new Date().toISOString().slice(0, 10);

  const byCategory = {};
  for (const a of articles) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  }

  let home = `---\ntitle: LinkedIn Content Index\ntags: [linkedin-ready, index]\ndate: ${updated}\n---\n\n`;
  home += `# LinkedIn Content Index\n\n`;
  home += `> Auto-generated — updated **${updated}** | ${articles.length} articles\n\n`;

  home += `## All Articles\n\n`;
  home += `| Date | Title | Category |\n`;
  home += `|------|-------|----------|\n`;
  for (const a of articles) {
    home += `| ${a.date} | [[${a.slug}\\|${a.title}]] | ${a.category} |\n`;
  }
  home += '\n';

  for (const [cat, items] of Object.entries(byCategory)) {
    home += `## ${cat}\n\n`;
    for (const a of items) {
      home += `- [[${a.slug}|${a.title}]] — ${a.date}\n`;
    }
    home += '\n';
  }

  fs.writeFileSync(homePath, home);
  log(`Written local ${homePath}`);
}

// ── Git wiki sync ─────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', ...opts }).toString().trim();
}

function syncWiki(articles) {
  const pat = fs.readFileSync(PAT_FILE, 'utf8').trim();
  const remote = `https://${GIT_USER}:${pat}@${WIKI_REPO}`;

  // Clone or reset
  if (fs.existsSync(TMP_DIR)) {
    run(`rm -rf ${TMP_DIR}`);
  }

  log(`Cloning wiki...`);
  try {
    run(`git clone "${remote}" "${TMP_DIR}"`);
  } catch (e) {
    log(`Clone failed: ${e.message}`);
    log(`Ensure GitHub wiki is enabled and has at least one page created via the web UI.`);
    throw e;
  }

  // Configure git identity
  run(`git -C "${TMP_DIR}" config user.name "Agent K"`);
  run(`git -C "${TMP_DIR}" config user.email "${GIT_EMAIL}"`);

  // Wipe existing .md files (keep .git)
  for (const f of fs.readdirSync(TMP_DIR)) {
    if (f.endsWith('.md')) fs.unlinkSync(path.join(TMP_DIR, f));
  }

  // Write Home.md
  fs.writeFileSync(path.join(TMP_DIR, 'Home.md'), renderHome(articles));
  log(`Wrote Home.md`);

  // Write per-article pages
  for (const a of articles) {
    const filename = `${a.slug}.md`;
    fs.writeFileSync(path.join(TMP_DIR, filename), renderPage(a));
    log(`  + ${filename}`);
  }

  // Commit
  run(`git -C "${TMP_DIR}" add -A`);
  const status = run(`git -C "${TMP_DIR}" status --porcelain`);
  if (!status) {
    log('No changes to push — wiki is up to date.');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  run(`git -C "${TMP_DIR}" commit -m "chore: sync linkedin wiki ${date} (${articles.length} articles)"`);

  // Push (remote already has PAT)
  run(`git -C "${TMP_DIR}" push origin master || git -C "${TMP_DIR}" push origin main`);
  log(`Pushed ${articles.length} pages to wiki.`);

  // Cleanup
  run(`rm -rf "${TMP_DIR}"`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  log('=== sync-linkedin-wiki start ===');

  const filepaths = collectSources();
  log(`Found ${filepaths.length} source files`);

  if (filepaths.length === 0) {
    log('No linkedin-ready content found. Exiting.');
    return;
  }

  const articles = buildArticles(filepaths);
  log(`Built ${articles.length} article objects`);

  writeLocalHome(articles);
  syncWiki(articles);
  log('=== sync-linkedin-wiki done ===');
}

main();
