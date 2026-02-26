---
name: word
description: Create, edit, and format Word (.docx) documents using the Word MCP server. Use when user asks to create, update, or export Word documents.
---

Work with Word documents using the `word` MCP server tools.

## MCP Server
`word` — Office-Word-MCP-Server (GongRzhe)
Use absolute paths for all file operations.

## Key Tools by Category

### Document Management
| Tool | Purpose |
|------|---------|
| `create_document` | Create new .docx (params: `filename`, optional `title`, `author`) |
| `copy_document` | Duplicate a document |
| `get_document_info` | Properties and statistics |
| `get_document_text` | Extract all text |
| `get_document_outline` | View heading structure |
| `list_available_documents` | List .docx files in a directory |

### Content Insertion
| Tool | Purpose |
|------|---------|
| `add_paragraph` | Add text (params: `filename`, `text`, `style`, `font_size`, `bold`, `color`) |
| `add_heading` | Add heading level 1–9 |
| `add_picture` | Embed image |
| `add_table` | Insert table with data |
| `add_page_break` | Insert page break |

### Content Editing
| Tool | Purpose |
|------|---------|
| `search_and_replace` | Global find & replace |
| `delete_paragraph` | Remove paragraph by index |
| `replace_paragraph_block_below_header` | Replace content under a heading |

### Formatting
| Tool | Purpose |
|------|---------|
| `format_text` | Bold/italic/underline/color on character range |
| `format_table` | Borders, shading on whole table |
| `set_table_column_widths` | Set column widths |
| `merge_table_cells` | Merge cells in a block |

### Export
| Tool | Purpose |
|------|---------|
| `convert_to_pdf` | Export .docx to PDF |

## Workflow Pattern

1. Create: `create_document` with filename
2. Build: `add_heading` → `add_paragraph` → `add_table` as needed
3. Format: `format_table`, `format_text` after content is added
4. Export: `convert_to_pdf` for final delivery
5. Deliver: `send-file` skill

## Arguments
- `$ARGUMENTS` = document description, filename, or path to existing .docx
