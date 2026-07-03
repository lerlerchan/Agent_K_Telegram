#!/usr/bin/env node
/**
 * Sunday Metaphysics Arranger
 * Scans 00-inbox/ and 02-knowledge/ root for bazi/qimen/fengshui notes.
 * Fixes tags, moves to proper 02-knowledge/<subtag>/ subfolder.
 * Run: node arrange-metaphysics.js [--dry-run]
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
const DRY_RUN = process.argv.includes('--dry-run');

const KNOWN_SUBTAGS = ['qimen', 'bazi', 'fengshui'];

// Order matters — most specific first to avoid false matches
const RULES = [
  {
    subtag: 'qimen',
    pattern: /奇門|qi\s*men|qimen|遁甲|九宮格|九星.*八門|八門.*九星/i,
    dest: '02-knowledge/qimen',
  },
  {
    subtag: 'fengshui',
    // fengshui first — 五行/財位 appear in both; title/context settles it
    pattern: /風水|fengshui|feng\s*shui|煞氣|貔貅|羅盤|玄空|八宅|飛星|穿堂煞|財位|文昌位|驛馬位|水晶球|聚寶盆|五帝錢/i,
    dest: '02-knowledge/fengshui',
  },
  {
    subtag: 'bazi',
    pattern: /八字|bazi|ba\s*zi|四柱|命格|大運|流年|六親|食傷|印星|比劫|傷官|正財|偏財|正官|七殺|正印|偏印|天干|地支|日主|身強|身弱|命局|格局|納音|nayin|丙火|甲木|乙木|丁火|戊土|己土|庚金|辛金|壬水|癸水/i,
    dest: '02-knowledge/bazi',
  },
];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return {
    fm: match[1],
    body: content.slice(match[0].length),
    fmRaw: match[0],
  };
}

function getExistingSubtag(fm) {
  return KNOWN_SUBTAGS.find(t => new RegExp(`\\b${t}\\b`).test(fm)) || null;
}

function hasTag(fm, tag) {
  return new RegExp(`\\b${tag}\\b`).test(fm);
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

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const { fm, body } = parsed;

  // 1. Respect existing subtag — don't re-classify if already set
  let subtag = getExistingSubtag(fm);
  let rule = subtag ? RULES.find(r => r.subtag === subtag) : null;

  // 2. No existing subtag — pattern-match on full text
  if (!rule) {
    const fullText = fm + body;
    rule = RULES.find(r => r.pattern.test(fullText));
    if (!rule) return null; // not metaphysics
    subtag = rule.subtag;
  }

  const actions = [];
  let newFm = fm;

  // 3. Ensure metaphysics + subtag in tags
  const needTags = ['metaphysics', subtag].filter(t => !hasTag(fm, t));
  if (needTags.length > 0) {
    newFm = addTags(newFm, needTags);
    actions.push(`tag [${needTags.join(', ')}]`);
  }

  // 4. Move from inbox or 02-knowledge root to proper subfolder
  const destDir = path.join(VAULT, rule.dest);
  const isInbox = filePath.startsWith(INBOX);
  const isKnowledgeRoot = filePath.startsWith(path.join(VAULT, '02-knowledge')) &&
    path.dirname(filePath) === path.join(VAULT, '02-knowledge');

  const shouldMove = isInbox || isKnowledgeRoot;
  const destPath = path.join(destDir, path.basename(filePath));
  const alreadyInDest = filePath === destPath || filePath.startsWith(destDir + path.sep);

  if (shouldMove && !alreadyInDest) {
    actions.push(`move → ${rule.dest}/`);
  }

  if (actions.length === 0) return null;

  if (!DRY_RUN) {
    const newContent = `---\n${newFm}\n---${body}`;
    fs.writeFileSync(filePath, newContent, 'utf8');
    if (shouldMove && !alreadyInDest) {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(filePath, destPath);
    }
  }

  return { file: path.basename(filePath), subtag, actions };
}

function main() {
  console.log(`[arrange-metaphysics] ${DRY_RUN ? 'DRY RUN — ' : ''}${new Date().toISOString()}`);

  const inboxFiles = fs.readdirSync(INBOX)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(INBOX, f));

  const knowledgeRoot = path.join(VAULT, '02-knowledge');
  const looseKnowledge = fs.readdirSync(knowledgeRoot)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => path.join(knowledgeRoot, f));

  const results = [...inboxFiles, ...looseKnowledge]
    .map(processFile)
    .filter(Boolean);

  if (results.length === 0) {
    console.log('Nothing to arrange.');
    if (!DRY_RUN) sendTelegram('🔮 <b>Metaphysics Arrange (Sun)</b>\n• Nothing to arrange\n✅ Done');
    return;
  }

  for (const r of results) {
    console.log(`  [${r.subtag}] ${r.file} → ${r.actions.join(', ')}`);
  }
  console.log(`Done. ${results.length} file(s) processed.`);

  if (!DRY_RUN) {
    const date = new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short' });
    const counts = { qimen: 0, bazi: 0, fengshui: 0 };
    for (const r of results) counts[r.subtag] = (counts[r.subtag] || 0) + 1;
    let msg = `🔮 <b>Metaphysics Arrange (Sun) — ${date}</b>\n`;
    for (const [tag, n] of Object.entries(counts)) {
      if (n > 0) msg += `• ${tag}: ${n}\n`;
    }
    msg += `✅ Done`;
    sendTelegram(msg);
  }
}

main();
