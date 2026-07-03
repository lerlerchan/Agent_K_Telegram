#!/usr/bin/env node
/**
 * Friday Manga/Manhwa Arranger
 * Scans 00-inbox/ for manga, manhwa, manhua, webtoon, and comic creation notes.
 * Tags them and moves to 02-knowledge/manga/.
 * Run: node arrange-manga.js [--dry-run]
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
const DEST  = path.join(VAULT, '02-knowledge/manga');
const DRY_RUN = process.argv.includes('--dry-run');

// Matches manga/manhwa creation & reference content
const MANGA_PATTERN = /\b(manga|manhwa|manhua|webtoon|comic[s]?)\b|漫画|漫畫|만화|まんが|マンガ|\b(isekai|shounen|shōnen|shoujo|shōjo|seinen|josei|manhwa|isekai|cultivation|xianxia|xuanhuan|wuxia)\b|\b(storyboard|panel.?layout|character.?design|world.?build|story.?arc|manga.?creat|comic.?creat|draw.?style|art.?style|narrative.?panel|visual.?storytell)\b/i;

// ─── Frontmatter helpers ────────────────────────────────────────────────────

function parseFM(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: null, body: content };
  return { fm: m[1], body: content.slice(m[0].length) };
}

function getFMField(fm, field) {
  if (!fm) return null;
  const m = fm.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function setFMField(fm, field, value) {
  const line = `${field}: ${value}`;
  if (!fm) return line;
  const re = new RegExp(`^${field}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, line) : `${fm}\n${line}`;
}

function addTag(fm, tag) {
  if (!fm) return `tags: [${tag}]`;
  const existing = getFMField(fm, 'tags') || '[]';
  if (existing.includes(tag)) return fm;
  const updated = existing.replace(/\]$/, `, ${tag}]`);
  return setFMField(fm, 'tags', updated);
}

function writeFM(filePath, fm, body) {
  fs.writeFileSync(filePath, `---\n${fm}\n---${body}`);
}

function uniquePath(dir, base) {
  const target = path.join(dir, `${base}.md`);
  if (!fs.existsSync(target)) return target;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base}-${i}.md`))) i++;
  return path.join(dir, `${base}-${i}.md`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const date = new Date().toISOString().slice(0, 10);
  const entries = fs.readdirSync(INBOX, { withFileTypes: true });

  let moved = 0, tagged = 0, skipped = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (['README.md', 'CLAUDE.md', 'HARNESS.md'].includes(entry.name)) continue;

    const filePath = path.join(INBOX, entry.name);
    const content = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = parseFM(content);

    // Skip if already clustered
    if (getFMField(fm, 'cluster')) { skipped++; continue; }

    const fullText = (fm || '') + body;
    if (!MANGA_PATTERN.test(fullText)) { skipped++; continue; }

    let newFm = fm || '';
    newFm = addTag(newFm, 'manga');
    newFm = setFMField(newFm, 'cluster', 'manga');

    const base = path.basename(entry.name, '.md');
    const destPath = uniquePath(DEST, base);

    if (!DRY_RUN) {
      writeFM(filePath, newFm, body);
      fs.renameSync(filePath, destPath);
    }
    console.log(`[MANGA] ${entry.name} → 02-knowledge/manga/`);
    moved++;
  }

  console.log(`[DONE] moved=${moved} tagged=${tagged} skipped=${skipped}`);

  if (!DRY_RUN) {
    const breakdown = `📚 Manga Arrange (Fri) — ${date}\nMoved: ${moved} | Skipped: ${skipped}`;
    sendTelegram(breakdown);
  }
}

main();
