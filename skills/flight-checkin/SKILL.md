---
name: flight-checkin
description: Check in online for flights and download boarding pass using Playwright browser automation. Use when user asks to check in for a flight, get boarding pass, or do web check-in.
---

## When to Use
When user asks to check in for a flight, download boarding pass, or do online/web check-in.

## Required Info
Collect these before starting (ask user if missing):
1. **Airline** — e.g. AirAsia, MAS, Firefly, etc.
2. **Booking reference (PNR)** — e.g. OBPF3Z
3. **Flight date** — e.g. 3 March 2026
4. **Passenger name** — as per booking
5. **Mobile number** (optional) — for boarding pass SMS

## Approach: Playwright Browser Automation

Use the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_fill, browser_take_screenshot, etc.) to automate the check-in flow directly in the browser. Do NOT use any airline API.

### General Flow
1. Navigate to the airline's web check-in page
2. Enter booking reference + passenger last name (or full name)
3. Step through the check-in flow:
   - Skip seat selection (keep existing or accept default)
   - Skip all add-ons/upsells (baggage, meals, insurance, etc.)
   - Skip any paid upgrades
4. Confirm check-in
5. Download/screenshot the boarding pass
6. Send boarding pass to user

### Airline-Specific URLs

| Airline | Check-in URL |
|---------|-------------|
| AirAsia | `https://www.airasia.com/check-in` |
| Malaysia Airlines | `https://www.malaysiaairlines.com/ond/checkin` |
| Firefly | `https://www.fireflyz.com.my/web-check-in` |
| Batik Air | `https://www.batikairmalaysia.com/en/check-in` |
| Singapore Airlines | `https://www.singaporeair.com/en_UK/sg/manage-booking/checkin-online/` |

### Critical Rules

1. **NEVER buy add-ons** — skip all upsells (extra baggage, seats, meals, insurance, priority boarding). Look for "Skip", "No thanks", "Continue without", or "Next" buttons.
2. **Be patient with slow pages** — airline sites are slow. Use `browser_wait_for` or poll with `browser_snapshot` in a loop. Wait up to **120 seconds** for pages to load. Do NOT give up after a short timeout.
3. **Use browser_snapshot often** — take snapshots after every action to verify the page state before clicking. This prevents clicking wrong elements.
4. **Handle popups/modals** — airlines show cookie banners, promo popups, app install prompts. Dismiss them by clicking "X", "Close", "Accept", or "No thanks".
5. **Download boarding pass** — look for "Download boarding pass", "Get boarding pass", or "Print" buttons. If PDF download fails, use `browser_take_screenshot` as fallback.
6. **Save files to home directory** — save boarding pass to `~/boarding-pass-{PNR}.pdf` or `~/boarding-pass-{PNR}.png`

### AirAsia Specific Tips
- Check-in page: `https://www.airasia.com/check-in`
- Enter booking number (PNR) and last name
- The site is JS-heavy and slow — pages take 20-90 seconds to load
- After entering details, click "Check in" or "Search"
- Skip through add-on screens by finding "Continue" or "Skip" or "No, thanks"
- On the final confirmation page, look for "Download boarding pass"
- If the boarding pass is a PDF, download it. If not, screenshot it.

## Delivery
After downloading the boarding pass, deliver it using the send-file or send-telegram pattern:

```bash
cd ~/Agent_K_Telegram && node -e "
const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.telegram.sendDocument(process.env.TELEGRAM_GROUP_CHAT_ID, { source: 'BOARDING_PASS_PATH' }, { caption: '✈️ Boarding pass for PASSENGER - FLIGHT_DATE' })
  .then(() => { console.log('Sent'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

## Troubleshooting
- If page won't load: try refreshing with `browser_navigate` to the same URL
- If element not found: use `browser_snapshot` to see current state, look for alternative selectors
- If check-in fails: screenshot the error message and report to user
- If boarding pass won't download: use `browser_take_screenshot` as fallback
