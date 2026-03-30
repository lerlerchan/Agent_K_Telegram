---
name: Ollama file routing bug fix
description: File creation tasks were routed to Ollama instead of Claude when user had an Ollama model selected, causing "I cannot save files" responses
type: feedback
---

When a user has an Ollama model selected (`ollama:kimi-k2.5:cloud`, etc.) and asks for a file (docx, xlsx, pdf), the bot must route to Claude — Ollama has no file tools and returns "I cannot directly save files to your computer."

**Root cause:** `needsClaude` was computed AFTER `useOllama` in `src/index.js`, so the guard had no effect.

**Fix applied (2026-03-30):** Moved `FILE_TASK_PATTERNS` / `needsClaude` computation before `useOllama`, then added `!needsClaude` guard to `useOllama`. Also fixed `skills/word/SKILL.md` contradictory instruction (was telling Claude NOT to include `[SEND_FILE:]` in response, but bot only reads the final response text).

**Why:** Ollama returns HTTP 200 with a polite refusal — no error thrown, so no Claude fallback triggered.

**How to apply:** If "cannot save files" resurfaces, check routing order in `src/index.js` and verify `needsClaude` is computed before `useOllama`.
