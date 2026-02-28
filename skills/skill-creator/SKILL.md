---
name: skill-creator
description: Create or update Agent K skills following Anthropic's official best practices. Use when asked to create a new skill, improve an existing skill, or audit skill architecture.
---

# Skill Creator

Create, update, and audit skills following Anthropic's official architecture.

## Skill Directory Structure

```
skill-name/
├── SKILL.md              # REQUIRED — main instructions + YAML frontmatter
├── forms.md              # Optional — form definitions, field schemas, input templates
├── reference.md          # Optional — detailed docs, API specs, format guides
├── [topic].md            # Optional — extra topic docs (e.g. editing.md)
├── scripts/              # Optional — Python/Node scripts for deterministic tasks
│   ├── build_pdf.py
│   └── setup_db.py
├── references/           # Optional — multiple reference docs loaded on-demand
│   └── schemas.md
└── assets/               # Optional — files used in output
    └── templates/        # Optional — docx, xlsx, csv, html templates
```

## SKILL.md Format

### YAML Frontmatter (REQUIRED)

```yaml
---
name: skill-name
description: "Make descriptions pushy to combat undertriggering. Describe WHEN to trigger + WHAT it does."
---
```

- `name` — identifier, matches folder name
- `description` — the PRIMARY triggering mechanism. Be specific about when to use this skill. List trigger phrases/keywords explicitly.

### Body Guidelines

- Keep under **500 lines** — move details to reference files
- Use **imperative form** — "Create the file" not "You should create"
- **Explain the WHY** — theory outperforms rigid MUSTs
- Include **realistic examples** of expected input/output
- Reference bundled files with context: "Read `reference.md` for field specifications"

## 3-Level Progressive Disclosure

| Level | Content | Size | Loaded when |
|-------|---------|------|-------------|
| 1. Metadata | `name` + `description` from frontmatter | ~100 words | Always in context |
| 2. SKILL.md body | Main instructions | <500 lines | When skill triggers |
| 3. Bundled files | scripts/, references/, assets/, forms.md | Unlimited | On-demand as needed |

This is critical for performance — heavy reference docs should NOT be in SKILL.md.

## When to Use Each File Type

| File | Purpose | Example |
|------|---------|---------|
| `SKILL.md` | Core instructions, workflow steps | "Step 1: Collect info, Step 2: Generate" |
| `forms.md` | Input field definitions, validation rules | PDF form fields, invoice line items |
| `reference.md` | API docs, format specs, detailed rules | Email template HTML, PDF library API |
| `scripts/*.py` | Deterministic tasks Claude shouldn't improvise | PDF generation, DB queries, API calls |
| `references/*.md` | Multiple reference docs | schemas.md, api.md, style-guide.md |
| `assets/` | Static files used in output | Icons, fonts, logos |
| `assets/templates/` | Document templates | invoice.docx, report.xlsx, email.html |

## Key Principle: Bundle Repeated Work

If Claude keeps writing the same script across different runs, **bundle it in `scripts/`**. This makes output deterministic and faster.

**Bad:** SKILL.md says "write a Python script to generate the PDF"
**Good:** SKILL.md says "run `scripts/build_pdf.py` with these arguments"

## Writing Quality Checklist

When creating or reviewing a skill:

1. Has YAML frontmatter with `name` and `description`?
2. Description is pushy enough to trigger correctly?
3. Under 500 lines? Heavy docs moved to reference files?
4. Uses imperative form?
5. Explains WHY, not just WHAT?
6. Scripts in `scripts/` for deterministic tasks?
7. References to bundled files include guidance on WHEN to read them?
8. No duplicated boilerplate — delegate to other skills instead?
9. Realistic examples included?
10. Output format clearly defined?

## Agent K Conventions

These are specific to our Agent K setup:

- Python path: `/Users/aitraining2u/.local/share/office-venv/bin/python`
- Office docs: use `python-docx`, `openpyxl`, `python-pptx` (NOT MCP servers)
- File delivery: delegate to `send-file` or `send-telegram` skill — don't duplicate the Telegram boilerplate
- Save output to `~/` (WORKSPACE_DIR)
- Skills live in `~/Agent_K_Telegram/skills/` (symlinked to `~/.claude/skills/`)
- DB path for skills with persistence: `~/Agent_K_Telegram/data/`

## Creating a New Skill

1. Create directory: `~/Agent_K_Telegram/skills/<skill-name>/`
2. Write `SKILL.md` with frontmatter + instructions
3. Add `scripts/` if deterministic tasks needed
4. Add `reference.md` or `forms.md` if heavy docs needed
5. Test with a realistic prompt
6. The skill is auto-discovered via symlink — no registration needed

## Auditing an Existing Skill

Read `references/audit-checklist.md` for the full audit procedure.
