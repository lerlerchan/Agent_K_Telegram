---
name: google-sheets
description: Read, write, and manage Google Sheets using the google-sheets MCP server. Use when user asks to create, edit, update, or export Google Sheets.
---

Work with Google Sheets using the `google-sheets` MCP server tools.

## MCP Server
`google-sheets` — `uvx mcp-google-sheets@latest`
Auth: `~/.gdrive-mcp/credentials.json` + `~/.gdrive-mcp/sheets-token.json`
Use `spreadsheet_id` (the ID from the URL between `/d/` and `/edit`).

## Available Tools (19)

### Read
| Tool | Purpose |
|------|---------|
| `list_spreadsheets` | List spreadsheets in Drive folder |
| `search_spreadsheets` | Find spreadsheets by name |
| `get_sheet_data` | Read values from a range (A1 notation) |
| `get_sheet_formulas` | Read formulas (not computed values) |
| `get_multiple_sheet_data` | Read multiple ranges at once |
| `get_multiple_spreadsheet_summary` | Get title, sheet names, headers for multiple files |
| `list_sheets` | List all tabs in a spreadsheet |
| `find_in_spreadsheet` | Search for content |
| `list_folders` | List Drive folders |

### Write
| Tool | Purpose |
|------|---------|
| `update_cells` | Write data to a range |
| `batch_update_cells` | Write multiple ranges in one call |
| `batch_update` | General batch update |
| `add_rows` | Insert rows at an index |
| `add_columns` | Insert columns at an index |

### Create / Manage
| Tool | Purpose |
|------|---------|
| `create_spreadsheet` | Create new spreadsheet |
| `create_sheet` | Add new tab to spreadsheet |
| `rename_sheet` | Rename a tab |
| `copy_sheet` | Duplicate a tab |
| `share_spreadsheet` | Share with users (viewer/editor) |

## Workflow Pattern

1. Read: `get_sheet_data` with `spreadsheet_id` + `sheet` (tab name) + `range`
2. Write: `batch_update_cells` for multiple cells at once
3. Export as PDF for delivery (use Sheets export URL via Python + OAuth token)
4. Deliver: use `send-file` skill

## Export as PDF
```python
import json, requests
from google.oauth2.credentials import Credentials
TOKEN_PATH = '/Users/aitraining2u/.gdrive-mcp/sheets-token.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive']
creds = Credentials.from_authorized_user_info(json.load(open(TOKEN_PATH)), SCOPES)
url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=pdf&gid=0&portrait=true&fitw=true&gridlines=false"
resp = requests.get(url, headers={'Authorization': f'Bearer {creds.token}'})
open('/tmp/output.pdf','wb').write(resp.content)
```

## Arguments
- `$ARGUMENTS` = spreadsheet ID or URL, plus task description
