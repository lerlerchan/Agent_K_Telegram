---
name: web-search
description: Search the web using Playwright. Triggers on: search the web, look up, find info, google, research, what is, latest news on, find articles about
---

# Web Search Skill

Search the web via Google (with DuckDuckGo fallback) and return a concise summary with source links.

## Trigger phrases
- "search for ...", "search: ...", "google ..."
- "look up ...", "find info on ..."
- "research ...", "what is ..."
- "latest news on ...", "find articles about ..."

## Workflow

1. **Navigate to Google**
   ```
   browser_navigate https://www.google.com
   ```

2. **Type the search query**
   - Use `browser_type` to enter the query into the search input (`textarea[name="q"]` or `input[name="q"]`)
   - Press Enter or click the Search button

3. **Wait for results**
   ```
   browser_wait_for_load_state networkidle
   ```

4. **Handle news/latest queries**
   - If the query includes "latest", "news", "today", or "recent", click **Tools → Past week** to filter results

5. **Snapshot the results page**
   ```
   browser_snapshot
   ```

6. **Extract top 5 results**
   - From the snapshot, identify organic (non-sponsored) results
   - For each result, capture: title, URL, and snippet

7. **Synthesize and respond**
   - Write a 2–4 sentence summary of the findings
   - Follow with a numbered source list

## Output format

```
[2–4 sentence summary of what was found]

Sources:
1. [Title](URL)
2. [Title](URL)
3. [Title](URL)
4. [Title](URL)
5. [Title](URL)
```

## Rules

- Always start with a fresh navigation to Google — do not reuse a previous tab's state
- Skip sponsored/ad results; prefer organic results
- If Google shows a CAPTCHA or blocks the request, fall back to `https://duckduckgo.com/?q=<query>`
- Do not visit more than 2 individual result pages — the results page snapshot is sufficient for most queries
- If the user asks for a specific page (e.g. "open the first result"), navigate to it and take a snapshot before summarising
- Keep the summary factual and attributed — do not add opinions
