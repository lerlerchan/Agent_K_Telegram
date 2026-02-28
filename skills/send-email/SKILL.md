---
name: send-email
description: Send emails via Gmail API with proper display name, attachments, and CC support. Use when asked to send, email, forward, follow up, remind, or reply to someone via email. For follow-ups, automatically searches sent emails and replies in the same thread.
---

# Send Email

Send emails via Gmail API using the custom Python script (NOT Gmail MCP — MCP strips the From display name).

## Usage — New Email

```bash
~/.local/bin/uv run --with google-api-python-client --with google-auth \
  python3 ~/Agent_K_Telegram/skills/send-email/scripts/send_email.py \
  --to recipient@example.com \
  --subject "Subject line" \
  --html '<h1>Hello</h1><p>Body here</p>' \
  --cc cc1@example.com cc2@example.com \
  --attach /path/to/file.pdf
```

## Usage — Follow-Up / Reply in Thread

**ALWAYS use this flow** when the task involves following up, reminding, replying, or continuing a previous email conversation. This ensures the recipient sees the full email history.

### Step 1: Search for the last sent email
Use Gmail MCP `search_emails` to find the original sent email:
```
search_emails → query: "in:sent to:recipient@example.com subject:keyword"
```
- Use `in:sent` to find emails YOU sent
- Add subject keywords or recipient to narrow results
- If unsure of subject, just search by recipient: `"in:sent to:recipient@example.com"`

### Step 2: Read the email to get thread info + content
```
read_email → messageId: "<message_id from search>"
```
From the result, extract:
- **threadId** — the Gmail thread ID (for threading)
- **Message-ID** header — the RFC 2822 Message-ID, looks like `<CAxxxxxx@mail.gmail.com>` (for In-Reply-To)
- **Subject** — the original subject line (prepend `Re: ` if not already there)
- **To / CC recipients** — for reply-all, include all original recipients

### Step 3: Send reply in same thread
```bash
~/.local/bin/uv run --with google-api-python-client --with google-auth \
  python3 ~/Agent_K_Telegram/skills/send-email/scripts/send_email.py \
  --to recipient@example.com \
  --subject "Re: Original Subject" \
  --html '<p>Follow-up body here</p>' \
  --thread-id "18dxxxxxx" \
  --in-reply-to "<CAxxxxxx@mail.gmail.com>" \
  --cc cc1@example.com
```

### Threading Rules
- Subject **MUST** start with `Re: ` followed by the original subject
- Both `--thread-id` and `--in-reply-to` are **required** for proper threading
- **Reply-all by default** — include all original To/CC recipients so everyone stays in the loop
- The reply will appear in the same Gmail thread, so the recipient sees the full conversation history

## Arguments

| Arg | Required | Description |
|-----|----------|-------------|
| `--to` | Yes | Recipient email(s), space-separated |
| `--subject` | Yes | Email subject line |
| `--html` | Yes | HTML body string, or `@file.html` to read from file |
| `--cc` | No | CC recipients, space-separated. Default: use `$CC_EMAILS` from env |
| `--attach` | No | File path(s) to attach, space-separated |
| `--reply-to` | No | Reply-To address if different from sender |
| `--thread-id` | No | Gmail thread ID — reply lands in same thread |
| `--in-reply-to` | No | Message-ID header of the email being replied to |

## From Header

Emails are sent as: **Atlas (AiTraining2U) <atlas.aitraining2u@gmail.com>**

Configured via `$FROM_NAME` and `$FROM_EMAIL` env vars.

## Why Not Gmail MCP?

The Gmail MCP server (`@gongrzhe/server-gmail-autoauth-mcp`) strips the display name from the From header, sending as bare `atlas.aitraining2u@gmail.com`. The custom script preserves `Atlas (AiTraining2U)` as the sender name.

## OAuth Credentials

- Token: `~/.gmail-mcp/credentials.json`
- Keys: `~/.gmail-mcp/gcp-oauth.keys.json`
- Auto-refreshes expired tokens
