---
name: weekly-review
description: Sunday weekly review — reads past week's inbox notes and project status, checks goal alignment, drafts next week's priorities. Outputs filled weekly review note to ObsidianVault/Goals/.
trigger: /weekly-review
---

# Weekly Review Skill

Run every Sunday. Generates a filled `Goals/2-weekly-review.md` for the current week.

## Steps

### 1. Determine date range
- Today = Sunday. Week = Mon–Sun just ended.
- Week label: `YYYY-WNN` (ISO week number).

### 2. Scan inbox notes from past 7 days
```bash
find /home/lerler/ObsidianVault/00-inbox -name "*.md" -newer $(date -d "7 days ago" +%Y-%m-%d) 2>/dev/null
```
Read each file. Extract: topic, tags, key insight (1 line each).

### 3. Scan active projects
For each dir in `/home/lerler/ObsidianVault/01-projects/`:
- Read `README.md` or first `.md` file found
- Extract: project name, current status, any blockers

### 4. Read yearly goals
Read `/home/lerler/ObsidianVault/Goals/1-yearly-goals.md`.
Note which Q we're in and which goals are active.

### 5. Draft the weekly review
Fill template from `Goals/2-weekly-review.md`:
- **Done**: list completed/notable items from inbox scan + project scan
- **Missed**: anything that was supposed to happen but didn't (ask user if unsure)
- **Projects pulse**: table from step 3
- **Goal alignment**: assess honestly — are actions this week serving yearly goals?
- **Next week Top 3**: derive from project status + goal alignment

### 6. Write output
Save to:
```
/home/lerler/ObsidianVault/Goals/weekly/YYYY-WNN.md
```
Also update `Goals/2-weekly-review.md` with this week's date.

### 7. Report to user
Print summary:
- Week scanned
- N inbox notes reviewed
- N projects checked
- Top 3 priorities for next week
- Path to saved review

## Rules
- Never fabricate project status — only report what's in files
- If a project folder has no readable .md, mark status as "unknown"
- Keep review concise — each section max 5 bullets
- If run on non-Sunday, warn user but proceed anyway
