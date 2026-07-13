'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const dns = require('dns').promises;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Blocks RFC 1918, loopback, link-local, and other reserved ranges
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fc00:|fe80:)/;

async function isSafeUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  try {
    const addrs = await dns.resolve4(parsed.hostname);
    return addrs.length > 0 && addrs.every(ip => !PRIVATE_IP_RE.test(ip));
  } catch {
    return false;
  }
}

const VAULT_PATH = path.resolve(
  process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), 'ObsidianVault')
);
const INBOX_PATH = path.join(VAULT_PATH, '00-inbox');

function ensureInbox() {
  fs.mkdirSync(INBOX_PATH, { recursive: true });
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function todayPrefix() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function uniqueFilename(slug) {
  let name = `${todayPrefix()}-${slug}.md`;
  let filepath = path.join(INBOX_PATH, name);
  let counter = 2;
  while (fs.existsSync(filepath)) {
    name = `${todayPrefix()}-${slug}-${counter}.md`;
    filepath = path.join(INBOX_PATH, name);
    counter++;
  }
  return { name, filepath };
}

function isUrl(str) {
  return /^https?:\/\//i.test(str.trim());
}

function classifyTags(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const tags = [];

  // Domain tags
  if (/\b(bazi|eight characters|four pillars|paht chee)\b/.test(text)) tags.push('bazi');
  if (/\b(qi ?men|qimen|dun ?jia)\b/.test(text)) tags.push('qimen');
  if (tags.some(t => t === 'bazi' || t === 'qimen')) tags.push('metaphysics');

  if (/\b(n8n|zapier|make\.com|integromat|workflow automation)\b/.test(text)) {
    tags.push('teaching', 'n8n');
  }
  if (/\b(economy|gdp|inflation|interest rate|stock market|crypto|bitcoin|investment|forex|commodity|fed |treasury)\b/.test(text)) {
    tags.push('macro-finance');
  }
  if (/\b(startup|saas|product.market.fit|monetiz|business model|mrr|arr|bootstrap|founder)\b/.test(text)) {
    tags.push('business-idea');
  }
  if (/\b(legal|regulation|compliance|gdpr|court|attorney|lawsuit|copyright|privacy law)\b/.test(text)) {
    tags.push('legal-ai');
  }

  // AI sub-tags
  if (/\b(rag|retrieval.augmented|vector db|embedding|chroma|pinecone|weaviate|lightrag|faiss)\b/.test(text)) {
    tags.push('rag', 'ai-tools');
  }
  if (/\b(agent|multi.agent|langgraph|autogen|crewai|swarm|mcp|tool.use|agentic)\b/.test(text)) {
    tags.push('ai-agents', 'ai-tools');
  }
  if (/\b(obsidian|obsidian plugin|vault)\b/.test(text)) {
    tags.push('obsidian', 'ai-tools');
  }
  if (/\b(claude.code|claude code)\b/.test(text)) {
    tags.push('claude-code', 'ai-tools');
  }
  if (/\b(llm|language model|claude|gpt|gemini|ollama|mistral|llama|openai|anthropic|deepseek|qwen|hugging)\b/.test(text)) {
    tags.push('ai-tools');
  }

  // Deduplicate
  const unique = [...new Set(tags)];

  // News vs knowledge
  const isNews = /\b(release|launch|announc|raises|acquir|funding|ipo|v\d+\.\d+|updated?|new model)\b/.test(text);
  if (isNews) {
    if (unique.includes('ai-tools') || unique.includes('ai-agents') || unique.includes('rag')) {
      return ['news', 'ai-industry', ...unique];
    }
    return ['news', ...unique];
  }

  if (unique.length > 0) return ['knowledge', ...unique];
  return ['knowledge'];
}

async function fetchUrl(url) {
  if (!(await isSafeUrl(url))) {
    throw new Error('URL resolves to a private or reserved address');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentK/1.0)' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('title').first().text().trim() ||
      $('h1').first().text().trim() ||
      'Untitled';

    // Extract main content — prefer article/main, fallback to body
    let content = $('article').text() || $('main').text() || $('body').text();
    content = content.replace(/\s+/g, ' ').trim().slice(0, 8000);

    return { title, content };
  } finally {
    clearTimeout(timer);
  }
}

async function saveNote(title, rawContent, url = null) {
  ensureInbox();

  let content = rawContent.trim();
  let resolvedTitle = title;

  // If content is a URL, fetch and extract
  if (isUrl(content)) {
    const fetched = await fetchUrl(content);
    if (!resolvedTitle || resolvedTitle === 'Untitled') resolvedTitle = fetched.title;
    content = fetched.content;
    if (!url) url = rawContent.trim();
  }

  if (!resolvedTitle) resolvedTitle = 'Untitled';

  const slug = slugify(resolvedTitle) || 'untitled';
  const { name, filepath } = uniqueFilename(slug);

  const autoTags = classifyTags(resolvedTitle, content);
  const tagsYaml = autoTags.length === 1
    ? `tags: [${autoTags[0]}]`
    : `tags: [${autoTags.join(', ')}]`;

  const frontmatter = [
    '---',
    `title: "${resolvedTitle.replace(/"/g, '\\"')}"`,
    `date: ${new Date().toISOString()}`,
    'source: telegram',
    url ? `url: "${url}"` : 'url: ""',
    tagsYaml,
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(filepath, frontmatter + content, 'utf8');

  const wikiWebhook = process.env.WIKI_UPDATE_WEBHOOK;
  if (wikiWebhook) {
    fetch(wikiWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filepath }),
    }).catch(() => {});
  }

  return {
    filename: name,
    preview: content.slice(0, 100),
  };
}

function listNotes(n = 5) {
  ensureInbox();
  const files = fs.readdirSync(INBOX_PATH)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(INBOX_PATH, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n)
    .map(f => f.name);
  return files;
}

module.exports = { saveNote, listNotes, isUrl, classifyTags };
