---
name: flight-booking
description: Search for flights on Agoda using Playwright browser automation. Use when user asks to book a flight, search for flight prices, or find flights between cities on Agoda.
---

## When to Use
When user asks to book a flight, search for flights, compare flight prices, or find flights on Agoda.

## Required Info
Collect these before starting (ask user if missing):
1. **Origin airport/city** — e.g. Subang (SZB), KL (KUL), Penang (PEN)
2. **Destination airport/city** — e.g. Johor Bahru (JHB), Langkawi (LGK)
3. **Departure date** — e.g. "next Saturday", "28 Feb 2026"
4. **Time preference** (optional) — e.g. "after 7pm", "morning flight"
5. **Number of passengers** — default: 1
6. **Cabin class** — default: Economy
7. **Trip type** — default: One-way

## Arguments
- `$ARGUMENTS` = origin, destination, date, and preferences, e.g. "SZB to JHB 28 Feb after 7pm"
- Parse relative dates against today's date

## Approach: Playwright Browser Automation

Use the Playwright MCP tools to automate the Agoda flight search.

### Step 1: Navigate to Agoda Flights
```
browser_navigate → https://www.agoda.com/flights
```
Wait for page to load. The Flights tab should be selected by default.

### Step 2: Enter Origin Airport
1. Click the "Flying from" combobox
2. Type the airport code (e.g. "SZB") — codes work better than city names for disambiguation
3. Wait for dropdown to appear (use `browser_snapshot` to find options)
4. Click the correct airport option (e.g. "Sultan Abdul Aziz Shah Airport SZB")

### Step 3: Enter Destination Airport
1. The "Flying to" combobox auto-focuses after origin selection
2. Type the destination city or airport code (e.g. "Johor Bahru")
3. Wait for dropdown, then click the correct airport option (e.g. "Senai International Airport JHB")

### Step 4: Select Departure Date
1. The calendar opens automatically after destination selection
2. Today's date and past dates are disabled
3. Click the target date button (e.g. "Fri Feb 27 2026")
4. If the target month isn't visible, click "Next Month" to navigate forward
5. If today has no flights, try the next available date from the price calendar

### Step 5: Set Passengers and Class (if non-default)
- After date selection, the passenger/class dialog may open
- Default is 1 Adult, Economy — adjust if needed using Plus/Minus buttons
- Select cabin class: Economy, Premium economy, Business, or First

### Step 6: Search Flights
Click the "SEARCH FLIGHTS" button. Wait for results to load.
- Use `browser_wait_for` with `textGone: "Acquiring the best prices"` to wait for loading to complete
- If "No results found!" appears, check the date radio buttons at the top for nearby dates with availability

### Step 7: Read Flight Results
The results page shows:
- **Date radio buttons** at top with prices for nearby dates
- **Sort options**: Cheapest, Best overall, Fastest
- **Flight cards** with: airline, departure time, arrival time, duration, airport codes, price

Extract flight details from the snapshot. For each flight note:
- Airline name
- Departure time and airport (KUL vs SZB matters!)
- Arrival time and airport
- Duration
- Price (in RM)
- Baggage info (cabin bag only vs checked baggage included)

### Step 8: Filter by User Preferences
If user specified time preferences (e.g. "after 7pm"):
- Filter the results to only show matching flights
- Highlight which flights depart from the user's preferred airport (e.g. SZB vs KUL)

### Step 9: Present Results and Share Link
Capture the current page URL from the browser. Present results in a table:

```
| # | Airline | Depart | Arrive | Duration | From | Price |
|---|---------|--------|--------|----------|------|-------|
| 1 | AirAsia | 9:05 PM | 10:00 PM | 0h 55m | KUL T2 | RM 66 |
```

Share the Agoda results page URL so user can select and book:
```
https://www.agoda.com/flights/results?departureFrom=ORIGIN&departureFromType=1&arrivalTo=DEST&arrivalToType=1&departDate=YYYY-MM-DD&returnDate=YYYY-MM-DD&searchType=1&cabinType=Economy&adults=1&sort=8
```

### Step 10: Send via Telegram (optional)
If user wants results sent via Telegram:

```bash
cd ~/Agent_K_Telegram && node -e "
const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
const message = \`FLIGHT_SUMMARY_WITH_LINK\`;
bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
  .then(() => { console.log('Sent'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
"
```

**Message format:**
```
✈️ <b>Flights: ORIGIN → DEST</b>
📅 Date: DATE

FLIGHT_TABLE

👉 <b>Book here:</b>
AGODA_URL
```

## Common Airport Codes (Malaysia)
| Code | Airport | City |
|------|---------|------|
| KUL | Kuala Lumpur International Airport | Kuala Lumpur |
| SZB | Sultan Abdul Aziz Shah Airport | Subang |
| PEN | Penang International Airport | Penang |
| JHB | Senai International Airport | Johor Bahru |
| BKI | Kota Kinabalu International Airport | Kota Kinabalu |
| KCH | Kuching International Airport | Kuching |
| LGK | Langkawi International Airport | Langkawi |
| MYY | Miri Airport | Miri |
| SBW | Sibu Airport | Sibu |
| TGG | Sultan Mahmud Airport | Kuala Terengganu |
| KBR | Sultan Ismail Petra Airport | Kota Bharu |
| AOR | Sultan Abdul Halim Airport | Alor Setar |
| IPH | Sultan Azlan Shah Airport | Ipoh |
| SDK | Sandakan Airport | Sandakan |
| TWU | Tawau Airport | Tawau |

## Critical Rules

1. **NEVER complete a booking** — only search and present results with a link. The user books themselves.
2. **NEVER enter personal details** — no names, emails, phone numbers, or payment info.
3. **Use airport codes for origin search** — city names can be ambiguous (e.g. "Subang" matches Indonesia first). Use "SZB", "KUL", "JHB" etc.
4. **Note departure airport carefully** — SZB (Subang) and KUL (KLIA) are different airports. Some airlines fly from KUL, others from SZB. Always indicate which airport in results.
5. **Handle "No results"** — if no flights on selected date, check the date radio buttons for nearby dates with prices. Suggest alternatives.
6. **Be patient with loading** — Agoda flight search takes 10-30 seconds. Wait for "Acquiring the best prices" to disappear.
7. **Snapshots can be large** — use `browser_snapshot` to file when needed, then grep for specific data rather than reading the whole thing.
8. **Handle popups** — dismiss cookie banners, promo popups, and app install prompts.

## Troubleshooting

- **Airport not found in dropdown**: Try the IATA code instead of city name. Check spelling.
- **No results for date**: Look at the date radio buttons at top of results — they show prices for nearby dates.
- **Page stuck loading**: Wait up to 30 seconds. If still loading, refresh with `browser_navigate` to the results URL.
- **Snapshot too large**: Save to file and use grep to extract specific flight data.
- **Wrong airport selected**: SZB search also shows KUL flights. Clearly label which airport each flight departs from.
