#!/usr/bin/env node
/**
 * WordPress Travel Blog Generator — lertraveldiary
 * Tuesday + Thursday 10am MYT (2am UTC)
 *
 * Strategy:
 *  1. Scan vault for all linkedin-ready posts (skip index files)
 *  2. Cluster by shared tags
 *  3. Pick cluster not recently used
 *  4. Synthesize full content into personal travel+AI narrative (1000+ words)
 *  5. Save draft to wiki/wordpress/
 *  6. Track used clusters in logs/wordpress-state.json
 *
 * Cron: 0 2 * * 2,4  (Tue+Thu 10am MYT)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const VAULT      = '/home/lerler/ObsidianVault';
const LOG_FILE   = '/home/lerler/github/Agent_K_Telegram/logs/wordpress-post.log';
const STATE_FILE = '/home/lerler/github/Agent_K_Telegram/logs/wordpress-state.json';
const OUT_DIR    = path.join(VAULT, 'wiki', 'wordpress');
const TODAY      = new Date().toISOString().slice(0, 10);

// ── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
  const get = (k) => { const m = raw.match(new RegExp(`^${k}=(.+)$`, 'm')); return m ? m[1].trim() : null; };
  return {
    deepseekKey: get('DEEPSEEK_API_KEY'),
    botToken:    get('TELEGRAM_BOT_TOKEN'),
    chatId:      get('TELEGRAM_GROUP_CHAT_ID'),
  };
}

// ── Logging ──────────────────────────────────────────────────────────────────

const logLines = [];
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  logLines.push(line);
}
function flushLog() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, logLines.join('\n') + '\n');
}

// ── Telegram ─────────────────────────────────────────────────────────────────

function sendTelegram(text, token, chatId) {
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${token}/sendMessage`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ── Vault Scanner ────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  return { fm: m[1], body: content.slice(m[0].length).trim() };
}

function extractTags(fm) {
  const m = fm.match(/^tags:\s*\[([^\]]+)\]/m);
  if (!m) return [];
  return m[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
}

function extractField(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?$`, 'm'));
  return m ? m[1].trim() : null;
}

function scanLinkedInPosts() {
  const results = [];
  const walkDirs = [
    path.join(VAULT, 'outputs'),
    path.join(VAULT, 'wiki'),
    path.join(VAULT, '02-knowledge'),
    path.join(VAULT, '01-projects'),
  ];

  for (const dir of walkDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const content  = fs.readFileSync(filePath, 'utf8');
      const parsed   = parseFrontmatter(content);
      if (!parsed) continue;

      const tags = extractTags(parsed.fm);
      if (!tags.includes('linkedin-ready')) continue;
      if (tags.includes('index')) continue; // skip content index files

      const title = extractField(parsed.fm, 'title') || file.replace('.md', '');
      results.push({ filePath, file, title, tags, body: parsed.body, fm: parsed.fm });
    }
  }

  return results;
}

// ── Clustering ───────────────────────────────────────────────────────────────

const SKIP_TAGS = new Set(['linkedin-ready', 'index', 'draft', 'knowledge', 'news']);

function clusterPosts(posts) {
  // Group posts by their meaningful shared tags
  const clusters = {};

  for (const post of posts) {
    const meaningful = post.tags.filter(t => !SKIP_TAGS.has(t));
    // Use sorted tag combo as cluster key — find best overlap with existing clusters
    for (const tag of meaningful) {
      if (!clusters[tag]) clusters[tag] = [];
      if (!clusters[tag].find(p => p.filePath === post.filePath)) {
        clusters[tag].push(post);
      }
    }
  }

  // Only keep clusters with 2+ posts
  return Object.entries(clusters)
    .filter(([, posts]) => posts.length >= 2)
    .map(([tag, posts]) => ({ tag, posts }));
}

// ── State Management ─────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { usedClusters: [], usedPostCombos: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function pickCluster(clusters, state) {
  // Prefer clusters not recently used; sort by least-recently-used
  const recentTags = new Set(state.usedClusters.slice(-6)); // last 6 runs
  const unused = clusters.filter(c => !recentTags.has(c.tag));
  const pool   = unused.length > 0 ? unused : clusters;

  // Within pool, prefer cluster with most posts (richest synthesis material)
  pool.sort((a, b) => b.posts.length - a.posts.length);
  return pool[0] || null;
}

// ── DeepSeek ─────────────────────────────────────────────────────────────────

function callDeepSeek(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       'deepseek-chat',
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  2200,
      temperature: 0.75,
    });
    const req = https.request({
      hostname: 'api.deepseek.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json    = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          if (content) resolve(content);
          else reject(new Error(`DeepSeek error: ${data.slice(0, 300)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('DeepSeek timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

function buildPrompt(clusterTag, posts) {
  const postSummaries = posts.map((p, i) =>
    `--- Source Post ${i + 1}: "${p.title}" ---\n${p.body.slice(0, 1800)}`
  ).join('\n\n');

  return `You are writing for "LerTravelDiary" — a personal travel and AI learning blog by a Malaysian software developer who travels and learns AI on the road.

CONTEXT — Source Posts (LinkedIn articles about: ${clusterTag}):
${postSummaries}

TASK: Write a personal travel+AI blog post that synthesizes the key insights from the source posts above. Do NOT copy them — distill, connect, and reframe them through a personal travel learning lens.

WRITING REQUIREMENTS:
- Voice: First person, personal, honest, direct, no fluff.
- CRITICAL — NO FABRICATED EXPERIENCES: Do NOT invent specific trips, places, train rides, or people (e.g. "a monk on a train in Thailand"). The author is a Malaysian developer; you do not know their actual travel history. Use only honest, generic reflective framings: "away from my desk", "during a break in a kopitiam", "on a slow morning while traveling", "reviewing my notes after a trip". Never name a specific city, country, or fabricated scene as if it happened.
- Audience: Non-technical people (OPC — ordinary professional/career people) who want to understand AI but feel overwhelmed. Explain everything as if talking to a smart friend with no coding background.
- Angle: Position AI/tech learnings as realizations that come from stepping away from the office and reflecting — but grounded, not staged.
- Length: Minimum 1000 words, maximum 1400 words.
- Language: English only.

REQUIRED STRUCTURE:
# [Compelling H1 Title — personal, curiosity-triggering, under 70 chars — no fabricated place names]

[meta_description: 150-155 chars for SEO — write this as an HTML comment <!-- meta: ... --> at the top, before the H1]

[Opening hook — a travel moment or observation that leads into the AI insight, 2-3 sentences]

## [H2 — The realization or turning point]
[Personal narrative connecting travel to the insight from source posts]

## [H2 — What I actually learned / tested]
[Practical breakdown of the key concept, explained simply with examples]

## [H2 — Why this matters if you're not a techie]
[Direct connection to what non-technical readers can do with this]

## [H2 — The messy truth / what I got wrong first]
[One honest mistake or misconception, adds credibility]

## FAQ
**Q: [Question a Malaysian/SEA professional would ask]**
A: [Direct 2-3 sentence answer]

**Q: [Question about getting started or practical use]**
A: [Direct 2-3 sentence answer]

**Q: [Question about cost, complexity, or risk]**
A: [Direct 2-3 sentence answer]

[Closing — one clear action or mindset shift the reader can take today]

---
<!-- seo_title: [65-char SEO title] -->
<!-- focus_keyword: [main keyword phrase] -->
<!-- tags: travel, ai-learning, [2-3 more relevant tags] -->

Output ONLY the blog post in Markdown. Start with the HTML comment for meta, then the H1. No preamble.`;
}

// ── Post-Processing ───────────────────────────────────────────────────────────

function extractMeta(article) {
  const metaMatch  = article.match(/<!--\s*meta:\s*(.+?)\s*-->/);
  const seoMatch   = article.match(/<!--\s*seo_title:\s*(.+?)\s*-->/);
  const kwMatch    = article.match(/<!--\s*focus_keyword:\s*(.+?)\s*-->/);
  const tagsMatch  = article.match(/<!--\s*tags:\s*(.+?)\s*-->/);
  const h1Match    = article.match(/^#\s+(.+)$/m);

  return {
    meta:     metaMatch?.[1]?.trim() || '',
    seoTitle: seoMatch?.[1]?.trim()  || '',
    keyword:  kwMatch?.[1]?.trim()   || '',
    tags:     tagsMatch?.[1]?.trim() || 'travel, ai-learning',
    h1:       h1Match?.[1]?.trim()   || null,
  };
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function countWords(str) {
  return str.split(/\s+/).filter(Boolean).length;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('[START] generate-wordpress-post');

  const env = loadEnv();
  if (!env.deepseekKey) {
    log('[ERROR] DEEPSEEK_API_KEY missing in .env');
    flushLog();
    process.exit(1);
  }

  // 1. Scan vault
  const posts = scanLinkedInPosts();
  log(`[SCAN] Found ${posts.length} linkedin-ready posts`);

  if (posts.length === 0) {
    log('[WARN] No linkedin-ready posts found. Exiting.');
    sendTelegram('✍️ <b>WordPress Post (Tue/Thu)</b>\n• No linkedin-ready posts in vault\n⚠️ Skipped', env.botToken, env.chatId);
    flushLog();
    return;
  }

  // 2. Cluster
  const clusters = clusterPosts(posts);
  log(`[CLUSTER] ${clusters.length} viable clusters: ${clusters.map(c => `${c.tag}(${c.posts.length})`).join(', ')}`);

  if (clusters.length === 0) {
    log('[WARN] Not enough posts to form clusters. Using all posts.');
    clusters.push({ tag: 'ai-learning', posts });
  }

  // 3. Pick cluster
  const state   = loadState();
  const cluster = pickCluster(clusters, state);
  log(`[PICK] Cluster: "${cluster.tag}" — ${cluster.posts.length} posts`);
  cluster.posts.forEach(p => log(`  • ${p.title}`));

  // 4. Build prompt and call DeepSeek
  const prompt = buildPrompt(cluster.tag, cluster.posts);
  log('[DEEPSEEK] Calling API...');

  let article;
  try {
    article = await callDeepSeek(env.deepseekKey, prompt);
  } catch (err) {
    log(`[ERROR] DeepSeek failed: ${err.message}`);
    sendTelegram(`✍️ <b>WordPress Post (Tue/Thu)</b>\n❌ DeepSeek error: ${err.message}`, env.botToken, env.chatId);
    flushLog();
    process.exit(1);
  }

  const wordCount = countWords(article);
  log(`[DEEPSEEK] ${article.length} chars, ~${wordCount} words`);

  // 5. Extract metadata from article
  const meta = extractMeta(article);
  const title = meta.h1 || `AI + Travel: Lessons from ${cluster.tag}`;
  const slug  = slugify(title);
  const outPath = path.join(OUT_DIR, `${TODAY}-${slug}.md`);

  // 6. Build Obsidian note
  const sourceTitles = cluster.posts.map(p => p.title).join('; ');
  const tagsList = ['wordpress-draft', 'travel', 'ai-learning', ...cluster.tag.split(',').map(t => t.trim())];
  const uniqueTags = [...new Set(tagsList)].join(', ');

  const note = `---
title: "${title.replace(/"/g, "'")}"
date: ${TODAY}
tags: [${uniqueTags}]
status: draft
source: auto-generated
channel: lertraveldiary
meta_description: "${meta.meta.replace(/"/g, "'")}"
seo_title: "${meta.seoTitle.replace(/"/g, "'")}"
focus_keyword: "${meta.keyword.replace(/"/g, "'")}"
word_count: ${wordCount}
source_cluster: ${cluster.tag}
source_posts: "${sourceTitles.replace(/"/g, "'")}"
---

${article}
`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, note);
  log(`[SAVED] ${outPath}`);

  // 7. Update state
  state.usedClusters = [...(state.usedClusters || []), cluster.tag];
  state.usedPostCombos = [...(state.usedPostCombos || []), {
    date: TODAY,
    cluster: cluster.tag,
    posts: cluster.posts.map(p => p.file),
  }];
  saveState(state);
  log('[STATE] Updated wordpress-state.json');

  // 8. Telegram notification
  const date = new Date().toLocaleDateString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short',
  });
  const msg = [
    `✍️ <b>WordPress Draft — ${date}</b>`,
    `📌 <b>${title}</b>`,
    `• Theme: ${cluster.tag}`,
    `• Sources: ${cluster.posts.length} LinkedIn posts`,
    `• Words: ~${wordCount}`,
    `• File: wiki/wordpress/${path.basename(outPath)}`,
    `✅ Ready for review`,
  ].join('\n');
  sendTelegram(msg, env.botToken, env.chatId);

  flushLog();
  console.log(`\n✅ Done — ${outPath} (~${wordCount} words)`);
}

main().catch(err => {
  log(`[FATAL] ${err.message}`);
  flushLog();
  process.exit(1);
});
