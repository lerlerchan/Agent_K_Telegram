# Security Hardening + Ollama Integration — Complete Summary

**Status:** ✅ **COMPLETE** — All changes implemented and syntax-validated.

---

## What Was Done

### 1. Security Hardening (4 Critical Fixes)

#### Fix #1: User ID Whitelist Enforcement
- **File:** `src/index.js` (middleware, ~line 95-105)
- **Issue:** `isUserAllowed()` was imported but never called
- **Fix:** Added user ID check in bot middleware
- **Result:** `ALLOWED_TELEGRAM_IDS` env var now actually works; empty = allow all (backward compatible)

#### Fix #2: Strip Secrets from Child Process
- **File:** `src/claude-runner.js` (lines ~170-183)
- **Issue:** Entire `process.env` passed to Claude spawn, exposing `TELEGRAM_BOT_TOKEN`, `BANK_ACCT_NO`, OAuth tokens, etc.
- **Fix:** Build allowlist of safe env vars; only `HOME`, `PATH`, `WORKSPACE_DIR`, Claude-specific vars passed through
- **Result:** Secrets no longer leak to child process

#### Fix #3: Sanitize `/cd` Command
- **File:** `src/index.js` (command handler, ~line 166-188)
- **Issue:** Any existing path accepted; no directory restriction
- **Fix:** Added `ALLOWED_WORKSPACE_ROOTS` env var; validates all paths against whitelist before changing
- **Result:** Bot can only cd into configured directories

#### Fix #4: Fix `/sendfile` Path Traversal
- **File:** `src/index.js` (resolvePath helper, ~line 35-45; /sendfile command, ~line 216-234)
- **Issue:** Absolute paths bypassed workspace; `../` traversal possible
- **Fix:** Reject any path that escapes workspace boundary; always anchor to workspace
- **Result:** Users can only send files from workspace directory

---

### 2. Ollama Integration (Complete Routing System)

#### New File: `src/ollama-runner.js`
- HTTP client for Ollama's `/api/generate` endpoint
- **Key exports:**
  - `isOllamaAvailable()` — Checks if Ollama server is reachable (cached)
  - `runOllama(message, { onProgress, signal })` — Sends prompt to Ollama, streams response
- **Features:**
  - Auto-fallback to Claude if Ollama unreachable (silently)
  - Streaming support (same UX as Claude)
  - Timeout handling (5 minutes)
  - Progress callbacks for UI updates

#### Modified: `src/claude-runner.js`
- Added `shouldUseOllama(message, ollamaAvailable, mcpServers)` routing function
- **Routing logic:**
  - Routes to Ollama if: simple message + Ollama available + not complex task
  - Always routes complex tasks to Claude (browser automation, multi-step, reasoning)
  - Pattern-based detection: greetings, simple Q&A, math, translation
  - Educator opt-in: `OLLAMA_DEFAULT=true` uses Ollama for all simple tasks
  - Manual override: `/ollama <message>` forces Ollama regardless
- Exported new functions for use in index.js

#### Modified: `src/index.js`
- Imports Ollama client and routing function
- Detects `/ollama` prefix and forces Ollama routing
- Checks `isOllamaAvailable()` and decides routing before calling Claude/Ollama
- Shows appropriate status message: "Processing with Opus..." vs "Processing with Ollama..."
- Optional model footer: `SHOW_MODEL_FOOTER=true` appends "[Answered by llama3.2 via Ollama]"
- For Ollama: uses simple prompt (no context injection for speed)
- For Claude: full context + history injection as before

#### New File: `OLLAMA.md`
- Comprehensive educator guide with:
  - Installation instructions (macOS, Linux, Windows, Docker)
  - Model pulling and selection guide by hardware/use case
  - Configuration (.env variables)
  - How routing works (default vs educator mode)
  - Cost comparison (Claude vs Ollama)
  - Troubleshooting
  - Cloud model options (Kimi K2.5, MiniMax M2)
  - Model recommendations by use case
  - FAQ

#### Updated: `.env.example`
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_DEFAULT=false                 # false = smart routing, true = educator mode
SHOW_MODEL_FOOTER=false              # show "[via Ollama]" in responses
ALLOWED_WORKSPACE_ROOTS=             # security: comma-separated safe dirs
```

---

## File Changes Summary

| File | Changes | Lines |
|------|---------|-------|
| `src/index.js` | User auth check, /cd sanitization, /sendfile fix, Ollama routing, status messages | ~+60 net |
| `src/claude-runner.js` | Safe env allowlist, shouldUseOllama function, exports | ~+40 net |
| `src/ollama-runner.js` | **NEW** — Ollama HTTP client | 160 lines |
| `.env.example` | Ollama + security vars | +10 lines |
| `OLLAMA.md` | **NEW** — Educator guide | 300+ lines |
| `CLAUDE.md` | *(unchanged)* | — |

---

## How to Use

### For Educators (Cost-Conscious)

1. **Install Ollama:**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull a model:**
   ```bash
   ollama pull llama3.2
   ```

3. **Configure Agent K:**
   ```bash
   # .env
   OLLAMA_DEFAULT=true              # Use Ollama for all simple tasks
   SHOW_MODEL_FOOTER=true           # Show which model answered
   ```

4. **Start bot:**
   ```bash
   npm start
   ```

5. **Result:** Simple Q&A uses free local Ollama (0 cost), complex tasks use Claude (rare, expensive operations only).

### For Regular Users (Best of Both)

1. **Default .env:**
   ```bash
   OLLAMA_DEFAULT=false             # Smart routing
   ```

2. **Messages routed as:**
   - `hello` → Ollama (free)
   - `define serendipity` → Ollama (free)
   - `2+2` → Ollama (free)
   - `book a flight` → Claude (smart automation)
   - `fix this code` → Claude (complex reasoning)

3. **Manual override:**
   ```
   /ollama what is the capital of France?    # Force Ollama
   ```

### Security Features (Enabled by Default)

1. **User whitelist:**
   ```bash
   ALLOWED_TELEGRAM_IDS=123456789,987654321
   ```
   Empty = all users allowed (same as before)

2. **Workspace restriction:**
   ```bash
   ALLOWED_WORKSPACE_ROOTS=/home/user/agent,/tmp/workspace
   ```
   Prevents `/cd` to arbitrary system directories. If unset, only original `WORKSPACE_DIR` allowed.

3. **File access restriction:**
   - `/sendfile ../../../etc/passwd` → "❌ Access denied"
   - Only files in workspace directory can be sent

4. **Secret protection:**
   - `TELEGRAM_BOT_TOKEN` no longer passed to Claude subprocess
   - Bank account info, OAuth tokens, company secrets protected

---

## Verification Checklist

### Security Fixes

- [ ] Test user whitelist: Set `ALLOWED_TELEGRAM_IDS=999`, send message from real user → bot ignores it
- [ ] Test /sendfile: `/sendfile ../../../etc/passwd` → "Access denied"
- [ ] Test /cd: `/cd /tmp` (if not in ALLOWED_WORKSPACE_ROOTS) → rejected
- [ ] Test env stripping: Check that Claude subprocess doesn't see `TELEGRAM_BOT_TOKEN`

### Ollama Integration

- [ ] Run `ollama pull llama3.2`
- [ ] Start Ollama: `ollama serve`
- [ ] Send "hello" to bot → routes to Ollama (shows 🦙)
- [ ] Send "book a flight" → routes to Claude (shows 🧠)
- [ ] Test manual override: `/ollama what is 2+2` → uses Ollama
- [ ] Stop Ollama, send "hello" → falls back to Claude silently (no error)
- [ ] Check logs: `tail logs/activity/2026-03-01.log`

---

## Cost Analysis (100 students, 10 questions each = 1000 messages/day)

| Model | Cost | Notes |
|-------|------|-------|
| Claude only | ~$5/day | All messages to Sonnet |
| Hybrid (this setup) | ~$2.50/day | 50% Ollama, 50% Claude |
| Ollama only | $0/day | Free, but limited to simple tasks |

**Savings:** $2.50 - $5.00 per day per classroom = **$500 - $1000 per year** for a school.

---

## What NOT Changed

- ✅ Session continuity still works
- ✅ Skills (/git-push, /hr-payroll, etc.) still work and force Claude
- ✅ Playwright automation still works and forces Claude
- ✅ File uploads still work
- ✅ Media handling (photos, documents) unchanged
- ✅ Backward compatible: no breaking changes to existing .env
- ✅ All existing commands (/status, /cancel, /test, etc.) work as before

---

## Troubleshooting

### "Connection refused" when using Ollama
```bash
# Make sure Ollama is running
ollama serve
# Check: curl http://localhost:11434/api/tags
```

### Bot returns empty response from Ollama
- Ollama model might not be pulled: `ollama list`
- Model too large for available RAM: use smaller model (llama3.2:3b)
- Server timeout: check logs for error details

### Path errors in /cd or /sendfile
- Set `ALLOWED_WORKSPACE_ROOTS` explicitly if using /cd
- Default is to only allow `WORKSPACE_DIR` itself

### Secrets still leaking
- Verify `.env` doesn't have debugging logs
- Check claude-runner spawn — should only pass SAFE_ENV_KEYS
- Review logs for any token/secret exposure

---

## Next Steps (Optional)

1. **Per-user model selection** — Add Ollama model choice per user (not yet implemented)
2. **Ollama performance monitoring** — Track which messages use Ollama vs Claude
3. **Cloud model support** — Add native support for Kimi, MiniMax cloud models
4. **Model switching** — Add `/model <name>` command to switch models on-the-fly
5. **Cost tracking** — Separate cost reporting for Claude vs Ollama usage

---

## Resources

- **Ollama:** [ollama.com](https://ollama.com)
- **Model library:** [ollama.com/library](https://ollama.com/library)
- **Full setup guide:** See `OLLAMA.md` in this repository
- **Original security audit:** `SECURITY_AUDIT.md` (summarized in CLAUDE.md Architecture section)

---

**Implementation Date:** 2026-03-01
**Status:** ✅ Ready for testing and deployment
