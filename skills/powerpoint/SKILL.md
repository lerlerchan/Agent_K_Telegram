---
name: powerpoint
description: Create, edit, and design PowerPoint (.pptx) presentations using the PowerPoint MCP server. Use when user asks to create or edit slides, presentations, or decks.
---

Work with PowerPoint presentations using the `powerpoint` MCP server tools.

## MCP Server
`powerpoint` — Office-PowerPoint-MCP-Server (GongRzhe)
**Stateful** — must `create_presentation` or `open_presentation` first, then save at the end.

## Key Tools by Category

### Presentation Management
| Tool | Purpose |
|------|---------|
| `create_presentation` | New blank presentation (returns `presentation_id`) |
| `create_presentation_from_template` | Load from .pptx template, preserves theme |
| `open_presentation` | Open existing .pptx |
| `save_presentation` | Save to disk — **always call this at the end** |
| `get_presentation_info` | Metadata, slide count, dimensions |

### Slides & Content
| Tool | Purpose |
|------|---------|
| `add_slide` | Add new slide with optional background |
| `get_slide_info` | Inspect shapes and placeholders on a slide |
| `add_bullet_points` | Insert formatted bullet list |
| `manage_text` | Add/format/style text on a slide |
| `manage_image` | Add/enhance images |
| `add_table` | Insert table with formatting |
| `add_shape` | Insert shape with optional text |
| `add_chart` | Insert chart (categories + series data) |

### Templates & Design
| Tool | Purpose |
|------|---------|
| `list_slide_templates` | Browse available layout templates |
| `apply_slide_template` | Apply layout to a slide |
| `auto_generate_presentation` | AI-guided generation from a topic |
| `apply_professional_design` | Apply themes and design enhancement |
| `optimize_slide_text` | Improve text readability and fit |

### Advanced
| Tool | Purpose |
|------|---------|
| `manage_hyperlinks` | Add/remove/list links |
| `manage_slide_transitions` | Set slide transitions |
| `update_chart_data` | Replace chart data |
| `populate_placeholder` | Fill template placeholder |

## Workflow Pattern

1. **Open/Create**: `create_presentation` or `open_presentation` → get `presentation_id`
2. **Add slides**: `add_slide` for each slide
3. **Add content**: `add_bullet_points`, `manage_text`, `add_table`, `add_chart`
4. **Design**: `apply_professional_design` or `apply_slide_template`
5. **Save**: `save_presentation` — mandatory before delivery
6. **Deliver**: `send-file` skill

## Arguments
- `$ARGUMENTS` = presentation topic/description, or path to existing .pptx
