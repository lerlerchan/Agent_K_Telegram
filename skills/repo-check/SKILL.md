---
name: repo-check
description: Run after adding any new feature, skill, or env var to Agent K. Ensures security, setup guide, and git readiness.
---

## When to Use
Run this checklist AUTOMATICALLY after:
- Adding a new skill
- Adding a new env var
- Adding new credentials/auth
- Modifying any file that touches personal info or secrets

## Checklist

### 1. Security Scan
- [ ] Run: `git diff --cached` and `git diff` — scan for hardcoded secrets
      (API keys, tokens, passwords, emails, phone numbers, bank details, chat IDs)
- [ ] Verify `.env` is in `.gitignore`
- [ ] Verify no credential files are staged
- [ ] Any new personal info must use env var with fallback default
- [ ] Any new auth/token must go to `~/.claude/credentials/` or `~/.gmail-mcp/`

### 2. Setup Guide Updates
If a new env var was added:
- [ ] Add to `.env.example` with placeholder value
- [ ] Classify as MANDATORY / RECOMMENDED / OPTIONAL
- [ ] Add prompt to `scripts/setup.sh` in the correct section
- [ ] Update `README.md` if it affects first-run setup

If a new skill was added:
- [ ] Skill directory is in `repo/skills/` (not directly in `~/.claude/skills/`)
- [ ] Symlink exists: `~/.claude/skills/<name>` -> `repo/skills/<name>` (via whole-dir symlink)
- [ ] SKILL.md has proper frontmatter (name, description)
- [ ] No hardcoded paths to `~/.claude/skills/` — use `~/Agent_K_Telegram/skills/` paths
- [ ] Update project `CLAUDE.md` skills table

If new auth/credentials are needed:
- [ ] Add setup steps to `scripts/setup.sh`
- [ ] Document in `README.md` under Manual Setup
- [ ] Add skip option (feature degrades gracefully if not configured)

### 3. Git Readiness
- [ ] `git status` — only expected files are modified/added
- [ ] No `.env`, credentials, or tokens in staging
- [ ] Commit message describes what changed and why
- [ ] Push to remote

### 4. Test
- [ ] New feature works with env vars from `.env`
- [ ] New feature degrades gracefully if env var is missing
- [ ] Bot still starts and responds to `/test`
