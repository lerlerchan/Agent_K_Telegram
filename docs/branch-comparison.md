# Branch Comparison: `ollama_based` vs `agentCC`

> Reference for developers joining the project or reviewing branch history.

---

## Overview

Both branches build on the same `main` baseline. They serve different purposes and can coexist — `agentCC` contains everything in `ollama_based` plus an additional architectural layer.

| | `ollama_based` | `agentCC` |
|---|---|---|
| **Core focus** | Save API costs with a local LLM | Better internals + debugging tools |
| **New user commands** | `/model` (pick Ollama model) | `/debug_session`, `/maxturn` |
| **Primary audience** | End users on low budget / offline | Developers debugging the bot |
| **Security hardening** | Baseline | HTML injection fix + model validation |

---

## `ollama_based` Branch

**Purpose:** Multi-model routing — route simple tasks to a local Ollama model instead of the Claude API to reduce cost.

### What it adds over `main`

| Feature | File | Description |
|---|---|---|
| Ollama integration | `src/ollama-runner.js` | Spawns Ollama locally to answer simple prompts |
| `/model` command | `src/index.js` | Inline keyboard to choose Claude (haiku/sonnet/opus) or any local Ollama model |
| Cloud-first fallback | `src/index.js` | Ollama fails → falls back to Claude automatically |
| `/ollama` prefix | `src/index.js` | Force a message to run through Ollama regardless of routing logic |
| `shouldUseOllama()` | `src/claude-runner.js` | Pattern matcher — decides if a task is simple enough for local LLM |
| Cost saving | — | Greetings, translations, simple math → free (runs locally, no API cost) |

### Routing logic

```
User message
     │
     ▼
Is it a simple pattern? (greeting, translate, math...)
     │ YES                       NO
     ▼                           ▼
Run Ollama locally          Run Claude API
(free, fast)                (paid, powerful)
     │ FAIL
     ▼
Fallback to Claude
```

---

## `agentCC` Branch

**Purpose:** Architectural improvements borrowed from [claw-code](https://github.com/lerlerchan/claw-code) patterns, plus security hardening.

> `agentCC` is a superset of `ollama_based` — it includes all Ollama features and adds the layers below.

### What it adds over `ollama_based`

| Feature | File | Description |
|---|---|---|
| Typed event dispatcher | `src/claude-runner.js` | `STREAM_EVENT_HANDLERS` map + `dispatchStreamEvent()` replaces scattered if/else in Claude output parsing |
| Scored MCP detection | `src/claude-runner.js` | `scoreMcpServer()` scores token overlap instead of flat substring match — more structured, threshold-tunable |
| Per-user `maxTurns` | `src/database.js`, `src/index.js` | Each user can cap how many tool turns Claude is allowed (default: 30) |
| Dual audit trail | `src/database.js` | New `session_events` table logs routing decisions separately from chat messages |
| `/debug_session` command | `src/index.js` | Shows last 20 routing events — model chosen, MCP servers loaded, turn budget |
| `/maxturn <n>` command | `src/index.js` | Set personal max turns budget (1–100) |
| HTML injection fix | `src/index.js` | `escapeHtml()` applied to all DB-sourced content rendered in Telegram HTML messages |
| Tighter model validation | `src/database.js` | Ollama model names restricted to `[\w.\-:]+` — blocks HTML/special characters |

### New database table: `session_events`

```sql
CREATE TABLE session_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT,
  event_type       TEXT,   -- e.g. "routing"
  detail           TEXT,   -- e.g. "model=sonnet maxTurns=30 mcp=duckduckgo"
  created_at       TEXT
);
```

Separate from `audit_log` (which stores full message/response pairs). `session_events` is for routing decisions and debugging — not conversation history.

### New bot commands

| Command | What it does |
|---|---|
| `/debug_session` | Show last 20 routing events for your user — model used, MCP servers loaded, turn budget |
| `/maxturn <n>` | Set your personal Claude max-turns cap (1–100). Applies immediately to next request. |

### Architecture patterns (from claw-code)

| claw-code pattern | Applied as |
|---|---|
| `STREAM_EVENT_HANDLERS` typed dispatcher | Replaces if/else chain in `claude-runner.js` stdout handler |
| `ToolPermissionContext` scored matching | `scoreMcpServer()` — token overlap scoring for MCP server selection |
| Dual audit trail (transcript + event log) | `audit_log` (messages) + `session_events` (routing events) |
| `max_turns` per session | Per-user `max_turns` stored in SQLite, exposed via `/maxturn` |

---

## Merge Strategy

```
main  ──────────────────────────────────►
        │
        ├──► ollama_based   (Ollama routing)
        │
        └──► agentCC        (ollama_based + architecture + security)
```

To get all features: merge `agentCC` into your target branch.
`ollama_based` is a subset — do not merge it on top of `agentCC` as it would lose the architectural changes.

---

## File Change Summary

| File | `ollama_based` | `agentCC` |
|---|---|---|
| `src/claude-runner.js` | `shouldUseOllama()`, `SIMPLE_PATTERNS` | + `scoreMcpServer()`, `STREAM_EVENT_HANDLERS`, `dispatchStreamEvent()`, `maxTurns` param |
| `src/database.js` | `getPreferredModel()`, `setPreferredModel()` | + `session_events` table, `logEvent()`, `getSessionEvents()`, `getUserMaxTurns()`, `setUserMaxTurns()`, tighter `isValidModel()` |
| `src/index.js` | `/model` command, `callback_query` handler, Ollama routing | + `/debug_session`, `/maxturn`, `escapeHtml()`, `logEvent()` call on routing |
| `src/ollama-runner.js` | New file — Ollama subprocess runner | Unchanged |
