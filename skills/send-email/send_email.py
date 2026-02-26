#!/usr/bin/env python3
"""
Send email via Gmail API with proper display name in From header.
Usage: python3 send_email.py --to a@b.com --subject "..." --html body.html [--cc x@y.com] [--attach file.pdf]
"""
import argparse, base64, json, os, sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import mimetypes

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

TOKEN_PATH = os.path.expanduser("~/.gmail-mcp/credentials.json")
KEYS_PATH  = os.path.expanduser("~/.gmail-mcp/gcp-oauth.keys.json")
FROM_NAME  = os.environ.get("FROM_NAME", "Atlas (AiTraining2U)")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "atlas.aitraining2u@gmail.com")

def get_service():
    with open(TOKEN_PATH) as f:
        token_data = json.load(f)
    with open(KEYS_PATH) as f:
        keys_data = json.load(f)
    client = keys_data.get("installed") or keys_data.get("web", {})
    creds = Credentials(
        token=token_data.get("access_token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client.get("client_id"),
        client_secret=client.get("client_secret"),
        scopes=token_data.get("scope", "").split(),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_data["access_token"] = creds.token
        with open(TOKEN_PATH, "w") as f:
            json.dump(token_data, f, indent=2)
    return build("gmail", "v1", credentials=creds)


def send(to: list, subject: str, html_body: str, cc: list = None,
         attachments: list = None, reply_to: str = None):
    msg = MIMEMultipart("mixed")
    msg["From"]    = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"]      = ", ".join(to)
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to:
        msg["Reply-To"] = reply_to

    # HTML body
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)

    # Attachments
    for path in (attachments or []):
        mime_type, _ = mimetypes.guess_type(path)
        main_type, sub_type = (mime_type or "application/octet-stream").split("/", 1)
        with open(path, "rb") as f:
            data = f.read()
        part = MIMEBase(main_type, sub_type)
        part.set_payload(data)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment",
                        filename=os.path.basename(path))
        msg.attach(part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service = get_service()
    result = service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()
    print(f"Sent. Message ID: {result['id']}")
    return result["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--to",       nargs="+", required=True)
    parser.add_argument("--subject",  required=True)
    parser.add_argument("--html",     required=True, help="HTML body string or @file.html")
    parser.add_argument("--cc",       nargs="*", default=[])
    parser.add_argument("--attach",   nargs="*", default=[])
    parser.add_argument("--reply-to", default=None)
    args = parser.parse_args()

    html = args.html
    if html.startswith("@"):
        with open(html[1:]) as f:
            html = f.read()

    send(args.to, args.subject, html, args.cc, args.attach, args.reply_to)
