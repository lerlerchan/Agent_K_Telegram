---
name: hotel-booking
description: Search and book hotels on Agoda using Playwright browser automation. Use when user asks to book a hotel, search for hotel rates, or find accommodation on Agoda.
---

## When to Use
When user asks to book a hotel, check hotel prices, or find accommodation on Agoda.

## Required Info
Collect these before starting (ask user if missing):
1. **Hotel name** — e.g. M World Hotel, Hilton KL, etc.
2. **Check-in date** — e.g. "next Tuesday", "3 March 2026"
3. **Check-out date** — e.g. "Thursday", "5 March 2026"
4. **Number of adults** — default: 2
5. **Number of rooms** — default: 1
6. **Room preference** (optional) — e.g. King bed, Twin, with breakfast

## Arguments
- `$ARGUMENTS` = hotel name and date info, e.g. "M World Hotel next Tuesday to Thursday"
- Parse relative dates (next Tuesday, this Friday, etc.) against today's date

## Approach: Playwright Browser Automation

Use the Playwright MCP tools to automate the Agoda search and booking flow.

### Step 1: Navigate to Agoda
```
browser_navigate → https://www.agoda.com
```

### Step 2: Search for the Hotel
1. Click the destination search box (combobox "Enter a destination or property")
2. Type the hotel name using `browser_type`
3. Wait 2 seconds for autocomplete dropdown to appear
4. Use `browser_evaluate` to find and click the matching hotel option:
```js
() => {
  const options = document.querySelectorAll('[role="option"]');
  for (const opt of options) {
    if (opt.textContent.includes('HOTEL_NAME')) { opt.click(); return 'clicked'; }
  }
  return 'not found';
}
```

### Step 3: Set Check-in and Check-out Dates
Use `browser_evaluate` to click date cells by their `data-selenium-date` attribute:
```js
// Click check-in date
() => {
  const el = document.querySelector('span[data-selenium-date="YYYY-MM-DD"]');
  if (el) { el.click(); return 'clicked'; }
  return 'not found';
}
```
```js
// Click check-out date (same pattern)
() => {
  const el = document.querySelector('span[data-selenium-date="YYYY-MM-DD"]');
  if (el) { el.click(); return 'clicked'; }
  return 'not found';
}
```

If the target month is not visible, click the next month arrow button to navigate forward.

### Step 4: Click SEARCH
```js
() => {
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    if (b.textContent.trim() === 'SEARCH') { b.click(); return 'clicked'; }
  }
  return 'not found';
}
```

### Step 5: Open Hotel Page
From search results, find and click the hotel link:
```js
() => {
  const links = document.querySelectorAll('a');
  for (const a of links) {
    if (a.textContent.includes('HOTEL_NAME')) { a.click(); return 'clicked'; }
  }
  return 'not found';
}
```
The hotel page often opens in a new tab — use `browser_tabs` to switch to it.

### Step 6: Set Dates on Hotel Page
The hotel page may show a calendar popup. If check-in/out are not set:
1. Click the check-in date field to open the calendar
2. Select check-in date using `data-selenium-date` attribute
3. Select check-out date
4. Click the "Update" button to refresh room listings

### Step 7: Browse Room Options
Wait for room listings to load (look for "You won't be charged yet" or room price elements).
Take a screenshot to review available rooms.

**Present room options to user if they haven't specified a preference:**
- Room type, size, bed configuration
- Price per night
- Key perks (breakfast included, free cancellation, etc.)
- Rating if shown

**If user hasn't specified, pick the best value option** — generally:
1. Prefer rooms with **free cancellation** over non-refundable
2. Prefer rooms with **breakfast included** if price difference is small
3. Note "Our last room!" urgency warnings

### Step 8: Click Book
Click the "Book" or "Request to Book" button for the selected room option.
This navigates to the Booking Form page (new tab — switch to it).

### Step 9: Stop at Booking Form
**DO NOT fill in personal details or payment info.**
The booking form asks for: First name, Last name, Email, Country, Mobile number.

1. Dismiss any "You're almost done!" popup by clicking "Continue booking"
2. Take a screenshot of the booking form
3. Capture the current page URL

### Step 10: Send Link to User
Construct a clean, shareable hotel link with dates:
```
https://www.agoda.com/{hotel-slug}/hotel/{city}.html?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=N&rooms=N&children=0
```

Send via Telegram using the send-telegram pattern:
```bash
cd ~/Agent_K_Telegram && node -e "
const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
const message = \`HOTEL_SUMMARY_WITH_LINK\`;
bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
  .then(() => { console.log('Sent'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

**Message format:**
```
🏨 <b>HOTEL_NAME</b> (STAR_RATING, REVIEW_SCORE)
📅 Check-in: DATE → Check-out: DATE (N nights)
🛏 ROOM_TYPE, SIZE, BED_CONFIG
💰 PRICE per night (REFUND_POLICY)
✅ PERKS (WiFi, Parking, Breakfast, etc.)

👉 <b>Hotel page with dates:</b>
SHAREABLE_URL

Just fill in your name, email & phone, then book!
```

## Critical Rules

1. **NEVER enter personal details** — stop at the booking form. Do not fill in name, email, phone, or payment.
2. **NEVER complete a booking** — the user must do that themselves.
3. **Use browser_evaluate for Agoda interactions** — Agoda's dynamic React UI works better with direct JS evaluation than with snapshot-based clicking.
4. **Be patient with slow pages** — Agoda is JS-heavy. Wait 3-5 seconds after navigation and clicks. Use `browser_wait_for` with time parameter.
5. **Use browser_snapshot sparingly on Agoda** — the snapshots are very large. Prefer `browser_evaluate` to extract specific data and `browser_take_screenshot` to verify page state visually.
6. **Handle popups** — Agoda shows cookie banners, promo popups, and "almost done" urgency modals. Dismiss them.
7. **Calendar navigation** — if the target month isn't visible, click the forward arrow. Dates use `data-selenium-date="YYYY-MM-DD"` attribute on `<span>` elements.
8. **New tabs** — Hotel pages and booking forms often open in new tabs. Always check `browser_tabs` and switch as needed.
9. **Agoda URL redirects** — Agoda frequently redirects hotel pages to their search URL. The actual hotel content still loads — verify with `document.title` or `document.querySelector('h1')` via evaluate.

## Troubleshooting

- **Hotel not found in autocomplete**: Try shorter or alternate names. Check spelling.
- **Calendar month not visible**: Click the next-month arrow button. Look for `button` with arrow/chevron icon near the calendar header.
- **Room listings not loading**: Wait longer (up to 10 seconds). Try clicking the "Rooms" tab button.
- **Booking form redirect**: Agoda may redirect — check `browser_tabs` for the Booking Form tab.
- **Page snapshot too large**: Use `browser_evaluate` to extract specific text instead of full snapshots.
- **Date format**: Always use ISO format `YYYY-MM-DD` for date attributes.
