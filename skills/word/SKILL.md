---
name: word
description: Create, edit, and format Word (.docx) documents. Use when user asks to create, write, export, or download a Word document.
---

Create Word (.docx) documents by generating content and running the `make-docx.js` script via Bash.

## Workflow

1. **Write the content** as plain text (with `## Heading` markers for sections if needed)
2. **Run the script** to generate the .docx:

```bash
node /home/lerler/github/Agent_K_Telegram/scripts/make-docx.js \
  --title "Document Title" \
  --output "$WORKSPACE_DIR/filename.docx" \
  --content "Your full content here"
```

3. **Always include the tag verbatim in your response** so the bot delivers the file:
```
[SEND_FILE: /absolute/path/to/filename.docx]
```

The script prints `[SEND_FILE: /path]` to stdout. Copy that exact tag into your final response — the bot reads your response text (not the Bash output) to detect and deliver the file.

## Content Format

- Separate paragraphs with a blank line (`\n\n`)
- Use `# Heading` for H1 or `## Heading` for H2 sections
- Regular paragraphs need no special markup

## Example

```bash
node /home/lerler/github/Agent_K_Telegram/scripts/make-docx.js \
  --title "The Robot's Journey" \
  --output "$WORKSPACE_DIR/robot_story.docx" \
  --content "## Chapter 1\n\nOnce upon a time there was a robot.\n\nThe robot loved to write stories.\n\n## Chapter 2\n\nThe end."
```

## Arguments
- `$ARGUMENTS` = document description, filename, or topic to write about
