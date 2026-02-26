---
name: compact
description: Pre-compact memory flush — persist key context to daily log before compacting. Use before /compact or when context is getting heavy.
---

Perform a pre-compact memory flush to preserve important context before compression.

## Steps

1. **Read today's daily log** at `~/.claude/projects/-Users-aitraining2u/memory/daily/YYYY-MM-DD.md` (create if missing)

2. **Summarize current session** — append to the daily log:
   ```markdown
   ## Session — HH:MM
   ### What was done
   - [bullet points of completed work]

   ### Key decisions
   - [any architectural or design decisions made]

   ### Unfinished / Next steps
   - [what was in progress or planned]

   ### Learnings
   - [new patterns, gotchas, or insights discovered]
   ```

3. **Check MEMORY.md** — if any learning from this session is durable (confirmed across multiple uses, not speculative), add it to the `## Learnings` section

4. **Check topic files** — if any topic file needs updating based on this session's work, update it

5. **Confirm to user** that memory is flushed and safe to compact

## Arguments
- No args = flush current session context
- `$ARGUMENTS` = specific notes to include in the daily log

## Important
- Only write confirmed facts, not speculation
- Keep daily log entries concise (< 30 lines per session)
- Do NOT duplicate what's already in topic files
