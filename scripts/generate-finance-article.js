#!/usr/bin/env node
/**
 * Finance Article Generator
 * Every Thursday — generates AEO+SEO-friendly Malaysia/SEA finance article
 * Output: /home/lerler/ObsidianVault/02-knowledge/YYYY-MM-DD-{slug}.md
 *
 * Cron: 0 1 * * 4  (Thursday 9am MYT)
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const VAULT    = '/home/lerler/ObsidianVault';
const LOG_FILE = '/home/lerler/github/Agent_K_Telegram/logs/finance-article.log';
const TODAY    = new Date().toISOString().slice(0, 10);
const WEEK_NUM = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

// Topic pool — rotates weekly, covers major Malaysia/SEA finance areas
const TOPICS = [
  'Malaysia overnight policy rate: what it means for borrowers, savers, and the Ringgit',
  'Ringgit exchange rate drivers and what Malaysian consumers can do about it',
  'EPF dividends and why your retirement savings strategy in Malaysia needs a rethink',
  'Bursa Malaysia: how to read market signals without getting lost in the noise',
  'Malaysia property market outlook and what cooling measures really mean for buyers',
  'Inflation in Southeast Asia: how to protect your purchasing power as a Malaysian',
  'Malaysia REITs explained: passive income, risks, and how to pick one',
  'Digital banking in Malaysia: what the new licences change for everyday consumers',
  'Malaysia government budget priorities and how they affect household finances',
  'Gold investment in Malaysia: when it makes sense and when it does not',
  'Malaysia export data and what it actually signals about the economy',
  'Islamic finance basics: understanding Sukuk, Takaful, and why they matter for Malaysians',
];

function getTopic() {
  return TOPICS[WEEK_NUM % TOPICS.length];
}

// Load env values by key from .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    deepseekKey: get('DEEPSEEK_API_KEY'),
  };
}

function callDeepSeek(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       'deepseek-v4-pro',
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  1800,
      temperature: 0.7,
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
          else reject(new Error(`DeepSeek error: ${data.slice(0, 200)}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('DeepSeek timeout')); });
    req.write(body);
    req.end();
  });
}

function buildPrompt(topic) {
  return `You are a financial writer for a Malaysian audience. Write a clear, practical article about this topic:

Topic: ${topic}

Requirements:
- Length: 900–1100 words
- Language: Plain English. Explain jargon when first used.
- Tone: Professional but conversational — like explaining to a smart friend who is not a finance expert.
- Malaysian context: reference Bank Negara Malaysia, EPF, Bursa Malaysia, Ringgit, and local examples where relevant. Include SEA comparisons when useful.
- AEO/SEO structure (use Markdown headings):
  * H1: a clear, searchable title (under 70 characters)
  * Opening paragraph: answer the core question directly in 2–3 sentences
  * H2: What is [topic]? — define it simply
  * H2: Why it matters for Malaysians — concrete local impact
  * H2: How it works — key mechanics, numbers, or data points
  * H2: What you should know or watch — practical guidance or risk awareness
  * H2: FAQ — 3 questions a Malaysian reader would ask, each with a 2–3 sentence direct answer
  * Closing paragraph: one clear practical takeaway

Output ONLY the article in Markdown. Start directly with the H1 heading. No preamble or meta-commentary.`;
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
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

async function main() {
  const logLines = [];
  const log = (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    logLines.push(line);
  };
  const flushLog = () => {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, logLines.join('\n') + '\n');
  };

  log('[START] generate-finance-article');

  const env = loadEnv();
  if (!env.deepseekKey) {
    log('[ERROR] DEEPSEEK_API_KEY missing in .env');
    flushLog();
    process.exit(1);
  }

  const topic = getTopic();
  log(`[TOPIC] ${topic}`);

  const prompt = buildPrompt(topic);
  log('[DEEPSEEK] Calling API...');

  let article;
  try {
    article = await callDeepSeek(env.deepseekKey, prompt);
  } catch (err) {
    log(`[ERROR] DeepSeek call failed: ${err.message}`);
    flushLog();
    process.exit(1);
  }

  log(`[DEEPSEEK] Received ${article.length} chars`);

  const h1      = extractTitle(article);
  const slug    = slugify(h1 || topic);
  const filename = `${TODAY}-${slug}.md`;
  const outPath  = path.join(VAULT, 'wiki', filename);

  const note = `---
title: "${(h1 || topic).replace(/"/g, "'")}"
date: ${TODAY}
tags: [macro-finance, linkedin-ready, malaysia]
status: draft
source: auto-generated
channel: finance-weekly
---

${article}
`;

  fs.mkdirSync(path.join(VAULT, 'wiki'), { recursive: true });
  fs.writeFileSync(outPath, note);
  log(`[SAVED] ${outPath}`);

  flushLog();

  console.log(`\n✅ Done — ${outPath}`);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
