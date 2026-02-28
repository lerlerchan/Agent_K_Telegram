# Skill Audit Checklist

Run this checklist against each skill directory.

## Structure Audit

- [ ] Has `SKILL.md` file
- [ ] YAML frontmatter with `name` field
- [ ] YAML frontmatter with `description` field (pushy, trigger-focused)
- [ ] SKILL.md under 500 lines
- [ ] Python scripts in `scripts/` subfolder (not loose in root)
- [ ] No duplicate boilerplate (Telegram delivery, file sending)
- [ ] No recursive symlinks or stale artifacts
- [ ] References to bundled files include "when to read" guidance

## Content Audit

- [ ] Uses imperative form ("Create" not "You should create")
- [ ] Explains WHY behind instructions, not just rigid rules
- [ ] Includes realistic examples of expected input/output
- [ ] Output format clearly defined with template or example
- [ ] No hardcoded paths that should be environment variables
- [ ] No secrets or tokens embedded

## Integration Audit

- [ ] Listed in Agent K's CLAUDE.md skills table
- [ ] Trigger keywords match description (test: would "smart MCP" detect this?)
- [ ] Delegates to other skills where appropriate (send-file, send-telegram)
- [ ] Scripts use correct Python path: `/Users/aitraining2u/.local/share/office-venv/bin/python`

## Scoring

| Score | Meaning |
|-------|---------|
| Pass | All checks green |
| Minor | 1-2 low-priority issues |
| Needs fix | Missing frontmatter, missing SKILL.md, or broken structure |
