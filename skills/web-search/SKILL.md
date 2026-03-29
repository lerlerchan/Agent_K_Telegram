---
name: web-search
description: Search the web using DuckDuckGo MCP for live results. Triggers on: search the web, look up, find info, google, research, what is, latest news on, find articles about, current events, recent news
---

# Web Search Skill

Search the web via the `duckduckgo` MCP server and return a concise summary with source links.

## Trigger phrases
- "search for ...", "search: ...", "google ..."
- "look up ...", "find info on ..."
- "research ...", "what is ..."
- "latest news on ...", "find articles about ..."
- "what happened with ...", "current price of ..."

## Workflow

### Primary: DuckDuckGo MCP (preferred — fast, no browser needed)

Use the `duckduckgo` MCP tool directly:
1. Call the `search` tool from the `duckduckgo` MCP server with the user's query
2. Parse the results — each result has a title, URL, and snippet
3. Synthesize a 2–4 sentence summary
4. List the top sources

### Fallback: Playwright browser (if MCP is unavailable)

1. Navigate to `https://duckduckgo.com/?q=<query>`
2. Wait for results to load
3. Snapshot the page
4. Extract top 5 organic results (title, URL, snippet)

## Output format

```
[2–4 sentence summary of what was found]

Sources:
1. [Title](URL)
2. [Title](URL)
3. [Title](URL)
```

## Rules

- **Always search** — never answer current-events questions from training data alone
- Prefer the DuckDuckGo MCP tool over Playwright (faster, more reliable)
- Skip sponsored/ad results; prefer organic results
- Keep the summary factual and attributed — do not add opinions
- If the user asks for a specific page, navigate to it for a deeper summary
