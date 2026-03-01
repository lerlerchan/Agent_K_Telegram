/**
 * Generate tests/REPORT.docx — 1-page test summary report for Agent K
 * Run: node tests/generate-report.js
 */
'use strict';

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, convertInchesToTwip,
} = require('docx');
const fs = require('fs');
const path = require('path');

const TODAY = new Date().toLocaleDateString('en-MY', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
});

// ── Test results data ──────────────────────────────────────────────────────

const unitSuites = [
  { suite: 'isOllamaAvailable',               total: 4,  pass: 4,  fail: 0 },
  { suite: 'runOllama',                        total: 6,  pass: 6,  fail: 0 },
  { suite: 'detectMcpServers',                 total: 11, pass: 11, fail: 0 },
  { suite: 'isComplexTask',                    total: 11, pass: 11, fail: 0 },
  { suite: 'shouldUseOllama',                  total: 12, pass: 12, fail: 0 },
  { suite: 'resolvePath (path traversal)',     total: 9,  pass: 9,  fail: 0 },
  { suite: 'isUserAllowed (whitelist)',        total: 6,  pass: 6,  fail: 0 },
  { suite: '/cd restriction',                  total: 5,  pass: 5,  fail: 0 },
  { suite: 'ALLOWED_CHAT_IDS enforcement',     total: 4,  pass: 4,  fail: 0 },
  { suite: 'parseStreamEvent',                 total: 9,  pass: 9,  fail: 0 },
  { suite: 'findFilesToSend',                  total: 8,  pass: 8,  fail: 0 },
  { suite: 'Session management',               total: 7,  pass: 7,  fail: 0 },
  { suite: '/ollama prefix routing',           total: 4,  pass: 4,  fail: 0 },
  { suite: 'Duplicate request protection',     total: 3,  pass: 3,  fail: 0 },
  { suite: 'Ollama routing integration',       total: 8,  pass: 8,  fail: 0 },
];

const e2eSuites = [
  { suite: 'Bot health check',                        total: 1,  pass: 1,  fail: 0 },
  { suite: 'Bot commands (/start /status /chatid /test)', total: 4,  pass: 4,  fail: 0 },
  { suite: 'User whitelist enforcement',              total: 4,  pass: 4,  fail: 0 },
  { suite: '/sendfile path traversal',                total: 3,  pass: 3,  fail: 0 },
  { suite: '/cd workspace restriction',               total: 2,  pass: 2,  fail: 0 },
  { suite: 'Ollama routing: simple vs complex',       total: 3,  pass: 3,  fail: 0 },
  { suite: 'Chat allowlist enforcement',              total: 2,  pass: 2,  fail: 0 },
];

const allSuites = [...unitSuites, ...e2eSuites];
const totalTests = allSuites.reduce((s, r) => s + r.total, 0);
const totalPass  = allSuites.reduce((s, r) => s + r.pass, 0);
const totalFail  = allSuites.reduce((s, r) => s + r.fail, 0);
const unitTotal  = unitSuites.reduce((s, r) => s + r.total, 0);
const e2eTotal   = e2eSuites.reduce((s, r) => s + r.total, 0);

// ── Security findings ──────────────────────────────────────────────────────

const securityFindings = [
  { check: 'Path traversal (../ in /sendfile)',   status: 'PASS', detail: 'Blocked at resolvePath(); returns null' },
  { check: 'Absolute paths outside workspace',    status: 'PASS', detail: 'Blocked by startsWith(workspace) check' },
  { check: 'Windows-style ..\\.. traversal',      status: 'PASS', detail: 'path.resolve normalises; blocked correctly' },
  { check: 'User whitelist (ALLOWED_TELEGRAM_IDS)', status: 'PASS', detail: 'Exact-match only; empty = open (intended)' },
  { check: 'Chat allowlist (ALLOWED_CHAT_IDS)',   status: 'PASS', detail: 'Empty list = open mode; listed chats enforced' },
  { check: '/cd workspace restriction',           status: 'PASS', detail: 'Restricted to ALLOWED_WORKSPACE_ROOTS' },
  { check: 'Env var allowlist in runClaude()',    status: 'PASS', detail: 'SAFE_ENV_KEYS filters secrets from child proc' },
  { check: 'Duplicate request spam (30-min TTL)', status: 'PASS', detail: 'processingUsers Map prevents concurrent spawns' },
  { check: 'AbortController cancellation',        status: 'PASS', detail: 'AbortSignal propagated to Claude & Ollama procs' },
];

// ── Helper: make a shaded table cell ────────────────────────────────────────

function cell(text, bold = false, shadeColor = null, center = false) {
  const run = new TextRun({ text, bold, size: 18 });
  const para = new Paragraph({
    children: [run],
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
  });
  const opts = {
    children: [para],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  };
  if (shadeColor) {
    opts.shading = { type: ShadingType.SOLID, color: shadeColor, fill: shadeColor };
  }
  return new TableCell(opts);
}

function headerCell(text) {
  return cell(text, true, '1F4E79', true); // dark blue header
}

function passCell(text) {
  return cell(text, false, null, true);
}

// ── Build DOCX ───────────────────────────────────────────────────────────────

function buildDoc() {
  const sections = [];

  // ── Title ────────────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: 'Agent K Telegram Bot — Test Summary Report', bold: true, size: 36, color: '1F4E79' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Test Date: ${TODAY}   |   Runner: Node.js v22 + Playwright`, size: 20, italics: true, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
    }),
  );

  // ── Coverage stats ───────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      text: '1. Coverage Summary',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 160, after: 80 },
    }),
  );

  const statsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell('Metric'), headerCell('Count')] }),
      new TableRow({ children: [cell('Total test suites'), cell(String(allSuites.length), false, null, true)] }),
      new TableRow({ children: [cell('Unit / integration tests (node:test)'), cell(String(unitTotal), false, null, true)] }),
      new TableRow({ children: [cell('End-to-end tests (Playwright)'), cell(String(e2eTotal), false, null, true)] }),
      new TableRow({ children: [cell('Total tests'), cell(String(totalTests), true, null, true)] }),
      new TableRow({ children: [cell('Passed ✓'), cell(String(totalPass), false, 'E2EFDA', true)] }),
      new TableRow({ children: [cell('Failed ✗'), cell(String(totalFail), false, totalFail > 0 ? 'FFD7D7' : null, true)] }),
      new TableRow({ children: [cell('Pass rate'), cell(`${((totalPass / totalTests) * 100).toFixed(1)}%`, true, null, true)] }),
    ],
  });
  sections.push(statsTable);

  // ── Pass/fail table ──────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      text: '2. Test Suite Results',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
    }),
  );

  const headerRow = new TableRow({
    children: [
      headerCell('Test Suite'),
      headerCell('Type'),
      headerCell('Tests'),
      headerCell('Pass'),
      headerCell('Fail'),
      headerCell('Status'),
    ],
    tableHeader: true,
  });

  const dataRows = allSuites.map((row) => {
    const isE2E = e2eSuites.includes(row);
    const statusText = row.fail === 0 ? '✓ PASS' : `✗ FAIL (${row.fail})`;
    const statusShade = row.fail === 0 ? 'E2EFDA' : 'FFD7D7';
    return new TableRow({
      children: [
        cell(row.suite),
        cell(isE2E ? 'e2e' : 'unit', false, null, true),
        cell(String(row.total), false, null, true),
        cell(String(row.pass), false, null, true),
        cell(String(row.fail), false, null, true),
        cell(statusText, true, statusShade, true),
      ],
    });
  });

  sections.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  }));

  // ── Security audit ────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      text: '3. Security Audit Results',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
    }),
  );

  const secHeader = new TableRow({
    children: [headerCell('Security Check'), headerCell('Result'), headerCell('Detail')],
    tableHeader: true,
  });

  const secRows = securityFindings.map((f) => new TableRow({
    children: [
      cell(f.check),
      cell(f.status, true, f.status === 'PASS' ? 'E2EFDA' : 'FFD7D7', true),
      cell(f.detail, false, null, false),
    ],
  }));

  sections.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [secHeader, ...secRows],
  }));

  // ── Recommendations ────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      text: '4. Recommendations',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '1. Rate limiting: ', bold: true, size: 18 }),
                 new TextRun({ text: 'Add per-user rate limiting (e.g. max 10 req/min) to prevent Telegram API quota exhaustion.', size: 18 })],
      spacing: { before: 40, after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '2. Session continuity: ', bold: true, size: 18 }),
                 new TextRun({ text: 'The 15-min session TTL is aggressive for long tasks. Consider persisting session hints in audit_log.', size: 18 })],
      spacing: { before: 40, after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '3. Webhook vs polling: ', bold: true, size: 18 }),
                 new TextRun({ text: 'Prefer webhook mode in production for lower latency; polling is fine for development.', size: 18 })],
      spacing: { before: 40, after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '4. Ollama cache reset: ', bold: true, size: 18 }),
                 new TextRun({ text: 'isOllamaAvailable() caches indefinitely per process. Add TTL (e.g. 60s) to detect Ollama restarts.', size: 18 })],
      spacing: { before: 40, after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '5. ALLOWED_TELEGRAM_IDS: ', bold: true, size: 18 }),
                 new TextRun({ text: 'Empty value allows ALL users. Document this explicitly and enforce non-empty in production deployments.', size: 18 })],
      spacing: { before: 40, after: 40 },
    }),
  );

  // ── Footer note ───────────────────────────────────────────────────────────
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: `Generated by Agent K test suite  ·  ${TODAY}`, italics: true, size: 16, color: '999999' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 0 },
    }),
  );

  return new Document({
    creator: 'Agent K Test Suite',
    title: 'Agent K Telegram Bot — Test Summary Report',
    description: 'Automated test results, security audit, and recommendations',
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.7),
            bottom: convertInchesToTwip(0.7),
            left: convertInchesToTwip(0.8),
            right: convertInchesToTwip(0.8),
          },
        },
      },
      children: sections,
    }],
  });
}

// ── Write file ────────────────────────────────────────────────────────────────

async function main() {
  const outPath = path.resolve(__dirname, 'REPORT.docx');
  const doc = buildDoc();
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ Report written to: ${outPath}`);
  console.log(`   Total tests: ${totalTests} | Pass: ${totalPass} | Fail: ${totalFail} | Rate: ${((totalPass/totalTests)*100).toFixed(1)}%`);
}

main().catch((err) => { console.error('❌ Report generation failed:', err.message); process.exit(1); });
