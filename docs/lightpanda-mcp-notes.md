# Lightpanda MCP backend — implementation notes

Added 2026-08-03. Lightpanda runs alongside Playwright as a second MCP browsing
backend in `src/claude-runner.js`. Playwright was not removed.

## Why

Playwright is a full interactive browser — correct for login flows, form fills,
and JS-heavy SPA navigation, but heavier and slower than needed for simple
fetch/dump tasks (read a page, get today's news, pull links, scrape static or
JS-rendered content that doesn't need interaction). Lightpanda covers that
cheaper case.

## Install

```bash
mkdir -p ~/.local/bin
curl -L -o ~/.local/bin/lightpanda \
  https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux
chmod a+x ~/.local/bin/lightpanda
```

Installed to `~/.local/bin/lightpanda`, not `/usr/local/bin` — the latter
requires root and this environment has no sudo access. If you deploy to a box
where you *do* control `/usr/local/bin`, either install there and set
`LIGHTPANDA_BIN=/usr/local/bin/lightpanda`, or leave the default and just
make sure `~/.local/bin` exists and is writable for the service user.

`lightpanda mcp` defaults to stdio, matching how the Claude CLI expects MCP
server processes to be spawned — no extra flags required.

## Config (`src/claude-runner.js`)

Both servers live in `MCP_SERVERS`:

```js
const LIGHTPANDA_BIN = process.env.LIGHTPANDA_BIN || path.join(os.homedir(), '.local', 'bin', 'lightpanda');

playwright: { keywords: [...interaction terms...], config: { command: 'npx', args: [...] } },
lightpanda: { keywords: [...browse/fetch terms...], config: { command: LIGHTPANDA_BIN, args: ['mcp'] } },
```

## Routing

`detectMcpServers(message)` scores keyword overlap per server as before. New
step: if both `lightpanda` and `playwright` match the same message,
`INTERACTION_PATTERNS` (click, fill, login, sign in, submit, checkout, form,
check-in, boarding pass, book flight/hotel/ticket) decides the winner —
interaction signal present → playwright; otherwise → lightpanda (the default
for ambiguous/simple browsing asks).

`isComplexTask()` is unchanged — it only escalates to Opus when `playwright`
is loaded, not `lightpanda`. Lightpanda tasks stay on the cheaper/faster
default model path.

## Fallback

`runClaude()` wraps the single-attempt `runClaudeAttempt()`. If the MCP
selection was lightpanda-only and the result comes back empty or with
`resultEvent.is_error`, it retries once with `playwright` substituted for
`lightpanda`. This covers cases where Lightpanda's still-Beta DOM/API
coverage chokes on a page that looked like a simple fetch.

## Verified

- `"what's the top story on news.ycombinator.com"` → routed to `lightpanda`
  only, returned a current headline (confirms it isn't serving stale
  training-data answers — this was the original 2024-news bug being guarded
  against).
- Login + click flow on `the-internet.herokuapp.com/login` → routed to
  `playwright` only, completed the flow, returned the correct post-login
  page heading.

Both tests ran the real `runClaude()` path end-to-end against the live
Claude CLI, not mocks.
