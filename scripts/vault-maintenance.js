#!/usr/bin/env node
/**
 * Vault Maintenance Agent
 * --daily  : rename weird files, cluster related notes, mark orphans
 * --weekly : full frontmatter tagging with channel scoring
 * --dry-run: no writes, just log
 *
 * Cron:
 *   0 19 * * *  daily  3am MYT
 *   0 19 * * 6  weekly 3am MYT Sunday
 */

const fs   = require('fs');
const path = require('path');

const VAULT    = '/home/lerler/ObsidianVault';
const DRY_RUN  = process.argv.includes('--dry-run');
const DAILY    = process.argv.includes('--daily');
const WEEKLY   = process.argv.includes('--weekly');
const TODAY    = new Date().toISOString().slice(0, 10);

const LOG_FILE = '/home/lerler/github/Agent_K_Telegram/logs/vault-maintenance.log';

// Telegram notification (optional — reads from .env)
const https = require('https');
function loadEnvToken() {
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
    const chatMatch = raw.match(/^TELEGRAM_GROUP_CHAT_ID=(.+)$/m);
    return {
      token: match ? match[1].trim() : null,
      chatId: chatMatch ? chatMatch[1].trim() : null,
    };
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

// Folders to skip entirely
const SKIP_DIRS = ['.obsidian', '.claude', 'graphify-out', 'raw', 'outputs', 'output'];

// Folders where rename is NOT allowed (user-authored content)
const NO_RENAME_DIRS = ['02-knowledge', '03-teaching', '01-projects'];

// Files never touched by rename
const NO_RENAME_FILES = ['CLAUDE.md', 'README.md', 'HARNESS.md'];

// ─── Logging ────────────────────────────────────────────────────────────────

const logLines = [];
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  logLines.push(line);
}
function flushLog() {
  if (DRY_RUN) return;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, logLines.join('\n') + '\n');
}

// ─── Vault walker ───────────────────────────────────────────────────────────

function walkVault(dir = VAULT) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkVault(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

// ─── Frontmatter helpers ────────────────────────────────────────────────────

function parseFM(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { fm: null, body: content, fmStr: '' };
  return { fm: m[1], body: content.slice(m[0].length), fmStr: m[0] };
}

function getFMField(fm, key) {
  if (!fm) return null;
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

function setFMField(fm, key, value) {
  const line = `${key}: ${value}`;
  const re = new RegExp(`^${key}:.*$`, 'm');
  if (re.test(fm)) return fm.replace(re, line);
  return fm + `\n${line}`;
}

function getTagArray(fm) {
  if (!fm) return [];
  const m = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (!m) return [];
  return m[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean);
}

function upsertFMFields(fm, fields) {
  let result = fm || '';
  for (const [key, value] of Object.entries(fields)) {
    result = setFMField(result, key, value);
  }
  return result;
}

function writeFM(filePath, newFm, body) {
  if (DRY_RUN) return;
  fs.writeFileSync(filePath, `---\n${newFm}\n---${body}`);
}

// ─── TASK 1: Rename weird files ──────────────────────────────────────────────

const DATE_ONLY    = /^\d{4}-\d{2}-\d{2}$/;
const UUID_LIKE    = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UNTITLED_RE  = /^(untitled|new note)/i;

function isWeirdName(base) {
  const noExt = base.replace(/\.md$/, '');
  if (DATE_ONLY.test(noExt)) return true;
  if (UUID_LIKE.test(noExt)) return true;
  if (UNTITLED_RE.test(noExt)) return true;
  // Count meaningful words (ignore date prefix and short connectors)
  const stripped = noExt.replace(/^\d{4}-\d{2}-\d{2}-?/, '');
  const words = stripped.split(/[-_\s]+/).filter(w => w.length > 2);
  if (words.length < 3 && stripped.length < 10) return true;
  return false;
}

function inferName(content, filePath) {
  const { fm, body } = parseFM(content);
  // Try title field first
  const title = getFMField(fm, 'title');
  if (title && title.length > 4) {
    return slugify(title.split(' ').slice(0, 6).join(' '));
  }
  // First non-empty line of body
  const firstLine = body.split('\n').find(l => l.trim().length > 3);
  if (firstLine) {
    const clean = firstLine.replace(/^#+\s*/, '').replace(/[*_\[\]]/g, '');
    return slugify(clean.split(' ').slice(0, 6).join(' '));
  }
  return null;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function uniquePath(dir, name, ext = '.md') {
  let candidate = path.join(dir, name + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name}-${i}${ext}`);
    i++;
  }
  return candidate;
}

function taskRename(files) {
  log('[TASK-1] Rename weird filenames');
  let count = 0;
  for (const filePath of files) {
    const base = path.basename(filePath);
    // Skip protected files
    if (NO_RENAME_FILES.includes(base)) continue;
    // Skip user-authored directories
    const rel = path.relative(VAULT, filePath);
    if (NO_RENAME_DIRS.some(d => rel.startsWith(d + path.sep) || rel.startsWith(d + '/'))) continue;
    if (!isWeirdName(base)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const newSlug = inferName(content, filePath);
    if (!newSlug || newSlug.length < 3) continue;

    // Preserve date prefix if present
    const datePrefix = base.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const newName = datePrefix ? `${datePrefix}-${newSlug}` : newSlug;
    const newPath = uniquePath(path.dirname(filePath), newName);

    if (!DRY_RUN) fs.renameSync(filePath, newPath);
    log(`[RENAMED] ${base} → ${path.basename(newPath)}`);
    count++;
  }
  log(`[TASK-1] Done. ${count} file(s) renamed.`);
  return count;
}

// ─── TASK 2: Cluster related notes ──────────────────────────────────────────

// Maps topic keyword → existing folder (relative to vault)
const CLUSTER_MAP = [
  { topic: 'bazi',       keywords: /八字|bazi|四柱|命格|大運|七殺|日主|印星|食傷|比劫/i,  folder: '02-knowledge/bazi' },
  { topic: 'qimen',      keywords: /奇門|qimen|遁甲|qi.?men/i,                           folder: '02-knowledge/qimen' },
  { topic: 'fengshui',   keywords: /風水|fengshui|feng.?shui|財位|煞氣/i,                 folder: '02-knowledge/fengshui' },
  { topic: 'manga',      keywords: /\b(manga|manhwa|manhua|webtoon)\b|漫画|漫畫|만화|isekai|shounen|shoujo|seinen|xianxia|wuxia|cultivation/i, folder: '02-knowledge/manga' },
  { topic: 'github-repo',keywords: /github\.com\/[^/]+\/[^/\s]+/i,                       folder: '04-resources/github' },
  { topic: 'ai-tools',   keywords: /\bllm\b|claude|openai|gemini|anthropic|gpt/i,        folder: null },
  { topic: 'teaching',   keywords: /course|lecture|student|tutorial|workshop|training/i,  folder: '03-teaching' },
];

function detectCluster(content, fm) {
  const fullText = (fm || '') + content;
  for (const rule of CLUSTER_MAP) {
    if (rule.keywords.test(fullText)) return rule;
  }
  return null;
}

function taskCluster(files) {
  log('[TASK-2] Cluster related notes');
  let moved = 0, tagged = 0;

  for (const filePath of files) {
    if (NO_RENAME_FILES.includes(path.basename(filePath))) continue;
    const content  = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = parseFM(content);
    const existingCluster = getFMField(fm, 'cluster');
    if (existingCluster) continue; // already clustered

    const rule = detectCluster(content, fm);
    if (!rule) continue;

    let newFm = fm || '';
    newFm = setFMField(newFm, 'cluster', rule.topic);

    const destDir = rule.folder ? path.join(VAULT, rule.folder) : null;
    const inInbox = filePath.startsWith(path.join(VAULT, '00-inbox'));

    if (destDir && inInbox && fs.existsSync(destDir)) {
      const destPath = uniquePath(destDir, path.basename(filePath).replace('.md', ''));
      if (!DRY_RUN) {
        writeFM(filePath, newFm, body);
        fs.renameSync(filePath, destPath);
      }
      log(`[CLUSTERED] ${path.basename(filePath)} → ${rule.folder}/ (cluster=${rule.topic})`);
      moved++;
    } else {
      if (!DRY_RUN) writeFM(filePath, newFm, body);
      log(`[CLUSTER-TAGGED-ONLY] ${path.basename(filePath)} cluster=${rule.topic}`);
      tagged++;
    }
  }
  log(`[TASK-2] Done. ${moved} moved, ${tagged} tagged-only.`);
  return moved;
}

// ─── TASK 3: Orphans ────────────────────────────────────────────────────────

function taskOrphans(files) {
  log('[TASK-3] Mark orphans');
  let count = 0;
  for (const filePath of files) {
    if (NO_RENAME_FILES.includes(path.basename(filePath))) continue;
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; } // file may have been renamed by taskRename
    const { fm, body } = parseFM(content);
    if (!fm) continue;
    const cluster = getFMField(fm, 'cluster');
    const status  = getFMField(fm, 'status');
    if (cluster || status === 'orphan') continue;
    // Only mark notes in inbox or wiki as potential orphans
    const inInbox = filePath.includes('/00-inbox/') || filePath.includes('/wiki/');
    if (!inInbox) continue;

    const rule = detectCluster(content, fm);
    if (rule) continue; // has cluster match — skip

    const newFm = setFMField(fm, 'status', 'orphan');
    if (!DRY_RUN) writeFM(filePath, newFm, body);
    log(`[ORPHAN] ${path.basename(filePath)}`);
    count++;
  }
  log(`[TASK-3] Done. ${count} orphan(s) tagged.`);
  return count;
}

// ─── TASK 4: Weekly full frontmatter tagging ─────────────────────────────────

function scoreDepth(text) {
  const len = text.length;
  if (len > 3000) return 5;
  if (len > 1500) return 4;
  if (len > 500)  return 3;
  if (len > 100)  return 2;
  return 1;
}

function scoreOriginality(text) {
  const opinionWords = /\b(I think|I believe|in my view|I found|surprisingly|importantly|key insight|takeaway|my experience|我認為|我覺得|我發現)\b/i;
  const analysisWords = /\b(because|therefore|however|unlike|contrast|advantage|disadvantage|tradeoff|原因|因此|但是|相比)\b/i;
  let score = 2;
  if (opinionWords.test(text)) score++;
  if (analysisWords.test(text)) score++;
  if (text.length > 2000) score = Math.min(5, score + 1);
  return Math.min(5, score);
}

function detectAeoType(text, channelKeywords) {
  if (!channelKeywords.test(text)) return 'skip';
  if (/how to|step\s*\d|guide|tutorial|如何|怎么|方法|步骤/i.test(text)) return 'how-to';
  if (/vs\.?|compare|versus|difference|better than|vs|比較|對比/i.test(text)) return 'comparison';
  if (/best practice|tip|recommend|should|avoid|建議|最佳|注意/i.test(text)) return 'best-practice';
  if (/case study|example|scenario|實例|案例|命格/i.test(text)) return 'case-study';
  if (/destination|travel|visit|trip|hotel|flight|旅遊|旅行|景點/i.test(text)) return 'destination-guide';
  if (/story|diary|day \d|first day|itinerary|旅記|遊記/i.test(text)) return 'trip-story';
  return 'concept';
}

function scoreAeoFit(text, aeoType) {
  if (aeoType === 'skip') return 1;
  let score = 2;
  // Structured lists
  if (/^[-*\d]\.\s/m.test(text)) score++;
  // Has a question or answer pattern
  if (/\?\s|\bwhat\b|\bhow\b|\bwhy\b/i.test(text)) score++;
  // Has clear sections/headings
  if (/^#{1,3}\s/m.test(text)) score++;
  return Math.min(5, score);
}

function channelScore(text, keywordRe, aeoTypes) {
  const aeo = detectAeoType(text, keywordRe);
  if (aeo === 'skip') return { aeo: 'skip', score: 3, ready: false };
  const depth       = scoreDepth(text);
  const originality = scoreOriginality(text);
  const aeoFit      = scoreAeoFit(text, aeo);
  const total       = depth + originality + aeoFit;
  return { aeo, score: total, ready: total >= 9 };
}

const LERTECHNOTES_KW    = /\bai\b|llm|claude|gpt|api|mcp|agent|developer|code|tech|software|n8n|automation|prompt|model|workflow/i;
const LERDESTINY_KW      = /八字|bazi|奇門|qimen|風水|fengshui|命格|大運|七殺|五行|命理|四柱|紫微|流年/i;
const LERTRAVEL_KW       = /travel|trip|hotel|flight|destination|itinerary|旅遊|旅行|景點|酒店|機票|行程/i;

function inferStatus(content, fm) {
  if (!content || content.trim().length < 20) return 'empty';
  const tags = getTagArray(fm);
  if (tags.includes('draft')) return 'draft';
  return 'active';
}

function inferTitle(content, fm) {
  const existing = getFMField(fm, 'title');
  if (existing && existing !== '""' && existing.length > 3) return existing;
  const { body } = parseFM(content);
  const firstLine = body.split('\n').find(l => l.trim().length > 3);
  if (firstLine) return firstLine.replace(/^#+\s*/, '').replace(/[*_]/g, '').trim().slice(0, 80);
  return null;
}

function inferTags(content, fm) {
  const existing = getTagArray(fm);
  const additions = [];
  if (LERDESTINY_KW.test(content) && !existing.includes('metaphysics')) additions.push('metaphysics');
  if (LERTRAVEL_KW.test(content) && !existing.includes('travel')) additions.push('travel');
  if (LERTECHNOTES_KW.test(content) && !existing.includes('ai-tools')) additions.push('ai-tools');
  return [...new Set([...existing, ...additions])];
}

function taskWeeklyTag(files) {
  log('[TASK-4] Weekly full frontmatter tagging');
  let count = 0;
  for (const filePath of files) {
    // Skip protected files and user-authored dirs
    if (NO_RENAME_FILES.includes(path.basename(filePath))) continue;
    const rel = path.relative(VAULT, filePath);
    if (NO_RENAME_DIRS.some(d => rel.startsWith(d + path.sep) || rel.startsWith(d + '/'))) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = parseFM(content);
    const fullText = (fm || '') + body;

    const lertechnotes  = channelScore(fullText, LERTECHNOTES_KW);
    const lerdestiny    = channelScore(fullText, LERDESTINY_KW);
    const lertravel     = channelScore(fullText, LERTRAVEL_KW);
    const status        = inferStatus(body, fm);
    const title         = inferTitle(content, fm);
    const tags          = inferTags(fullText, fm);

    const fields = {
      last_tagged:         TODAY,
      status,
      ...(title ? { title: `"${title.replace(/"/g, "'")}"` } : {}),
      [`tags`]:            `[${tags.join(', ')}]`,
      lertechnotes_aeo:    lertechnotes.aeo,
      lertechnotes_score:  lertechnotes.score,
      lertechnotes_ready:  lertechnotes.ready,
      lerdestiny_aeo:      lerdestiny.aeo,
      lerdestiny_score:    lerdestiny.score,
      lerdestiny_ready:    lerdestiny.ready,
      lertravel_aeo:       lertravel.aeo,
      lertravel_score:     lertravel.score,
      lertravel_ready:     lertravel.ready,
    };

    let newFm = fm || '';
    // Rebuild tags line specifically (array format)
    newFm = newFm.replace(/^tags:\s*\[[^\]]*\]/m, `tags: [${tags.join(', ')}]`);
    if (!newFm.includes('tags:')) newFm += `\ntags: [${tags.join(', ')}]`;

    // Set remaining scalar fields
    for (const [key, val] of Object.entries(fields)) {
      if (key === 'tags') continue;
      newFm = setFMField(newFm, key, val);
    }

    if (!DRY_RUN) writeFM(filePath, newFm, body);

    const flags = [
      lertechnotes.ready  ? 'lertechnotes✓' : '',
      lerdestiny.ready    ? 'lerdestiny✓'   : '',
      lertravel.ready     ? 'lertravel✓'    : '',
    ].filter(Boolean).join(' ') || 'no-channel';

    log(`[TAGGED] ${path.basename(filePath)} status=${status} ${flags}`);
    count++;
  }
  log(`[TASK-4] Done. ${count} file(s) tagged.`);
  return count;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  if (!DAILY && !WEEKLY) {
    console.error('Usage: node vault-maintenance.js [--daily|--weekly] [--dry-run]');
    process.exit(1);
  }

  log(`[START] vault-maintenance ${DAILY ? '--daily' : '--weekly'} ${DRY_RUN ? '--dry-run' : ''}`);
  const files = walkVault();
  log(`[INFO] ${files.length} .md files found`);

  const stats = { renamed: 0, moved: 0, tagged: 0, orphans: 0, scored: 0 };

  if (DAILY) {
    stats.renamed = taskRename(files);
    // Re-walk after renames
    const refreshed = DRY_RUN ? files : walkVault();
    stats.moved = taskCluster(refreshed);
    stats.orphans = taskOrphans(refreshed);
  }

  if (WEEKLY) {
    stats.scored = taskWeeklyTag(files);
  }

  log('[DONE]');
  flushLog();

  if (!DRY_RUN) {
    const mode = DAILY ? 'daily' : 'weekly';
    const date = new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short' });
    let msg = `🗂 <b>Vault Maintenance (${mode}) — ${date}</b>\n`;
    if (DAILY) {
      msg += `• Renamed: ${stats.renamed}\n`;
      msg += `• Clustered/moved: ${stats.moved}\n`;
      msg += `• Orphans tagged: ${stats.orphans}\n`;
    }
    if (WEEKLY) {
      msg += `• Notes scored: ${stats.scored}\n`;
    }
    msg += `✅ Done`;
    sendTelegram(msg);
  }
}

main();
