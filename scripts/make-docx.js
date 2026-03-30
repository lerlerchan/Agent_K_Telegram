#!/usr/bin/env node
/**
 * make-docx.js — Generate a .docx file from text content using the docx npm package.
 *
 * Usage:
 *   node scripts/make-docx.js --title "My Title" --output "file.docx" --content "Body text here"
 *   echo "Body text" | node scripts/make-docx.js --title "My Title" --output "file.docx"
 *
 * The output path is resolved relative to WORKSPACE_DIR if not absolute.
 * Prints "[SEND_FILE: /absolute/path]" on success so the bot can detect and deliver the file.
 */

'use strict';

const { Document, Paragraph, HeadingLevel, TextRun, Packer } = require('docx');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse CLI args
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const title = get('--title') || 'Document';
const outputArg = get('--output') || `document_${Date.now()}.docx`;
const contentArg = get('--content');

// Resolve output path
const workspace = process.env.WORKSPACE_DIR || process.cwd();
const outputPath = path.isAbsolute(outputArg) ? outputArg : path.resolve(workspace, outputArg);

async function readStdin() {
  if (process.stdin.isTTY) return null;
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (l) => lines.push(l));
    rl.on('close', () => resolve(lines.join('\n')));
  });
}

async function main() {
  const rawContent = (contentArg || await readStdin() || '').replace(/\\n/g, '\n');

  // Split content into paragraphs on blank lines
  const blocks = rawContent.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const children = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
    }),
  ];

  for (const block of blocks) {
    // Detect if block looks like a heading (short, no punctuation at end, all caps or starts with #)
    if (block.startsWith('## ')) {
      children.push(new Paragraph({ text: block.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (block.startsWith('# ')) {
      children.push(new Paragraph({ text: block.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else {
      // Regular paragraph — split into lines and join with spaces
      const text = block.replace(/\n/g, ' ');
      children.push(new Paragraph({ children: [new TextRun(text)] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);

  // Print the SEND_FILE tag so the bot can deliver the file
  console.log(`[SEND_FILE: ${outputPath}]`);
  console.log(`Document created: ${outputPath}`);
}

main().catch((err) => {
  console.error(`make-docx error: ${err.message}`);
  process.exit(1);
});
