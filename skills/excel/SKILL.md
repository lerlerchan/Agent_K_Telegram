---
name: excel
description: Read, write, and format Excel (.xlsx) files using the Excel MCP server. Use when user asks to create, edit, or export Excel spreadsheets.
---

Work with Excel files using the `excel` MCP server tools.

## MCP Server
`excel` — `npx --yes @negokaz/excel-mcp-server`
All files require **absolute paths** (e.g. `/Users/aitraining2u/...`).

## Available Tools

| Tool | Purpose |
|------|---------|
| `excel_describe_sheets` | List all sheets in a file |
| `excel_read_sheet` | Read cell values (with optional range, formula view, style view) |
| `excel_write_to_sheet` | Write values/formulas to a range (use `=` prefix for formulas) |
| `excel_create_table` | Create a named table from a range |
| `excel_copy_sheet` | Duplicate a sheet within the file |
| `excel_format_range` | Apply font, fill, border, number format styling |

> `excel_screen_capture` is Windows-only — skip on macOS.

## Workflow Pattern

1. Read first: `excel_describe_sheets` → `excel_read_sheet`
2. Write: `excel_write_to_sheet` with `newSheet: false` to update existing
3. Format: `excel_format_range` after writing
4. Deliver: use `send-file` skill to send via Telegram

## Arguments
- `$ARGUMENTS` = task description, file path, or "create new file at <path>"
