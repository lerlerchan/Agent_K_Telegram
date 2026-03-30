# Memory Index

## Daily Logs
- [2026-03-30](daily/2026-03-30.md) — Added /model command: per-user model selection (haiku/sonnet/opus/auto) via inline keyboard
- [2026-03-29](daily/2026-03-29.md) — Short session; /compact flush; 3 uncommitted modified files noted
- [2026-03-17](daily/2026-03-17.md) — First session: pushed DEPLOY.md + web-search skill, saved GitHub PAT

## Learnings
- GitHub push: use `lerlerchan` as username (not `atlas-aitraining2u`); PAT at `~/.claude/credentials/github-pat`
- Repo: `https://github.com/lerlerchan/Agent_K_Telegram.git`
- [Ollama file routing bug](feedback_ollama_file_routing.md) — File tasks routed to Ollama (kimi-k2.5) which can't save files; fix: `needsClaude` must be computed before `useOllama` in `src/index.js`
