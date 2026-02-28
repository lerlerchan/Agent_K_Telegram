#!/usr/bin/env python3
"""Google Drive & Sheets OAuth setup — opens browser for consent, saves tokens."""

import json
import os
import sys

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]
TOKEN_DIR = os.path.expanduser("~/.gdrive-mcp")
CLIENT_FILE = os.path.join(TOKEN_DIR, "credentials.json")
TOKEN_FILE = os.path.join(TOKEN_DIR, "sheets-token.json")


def main():
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("Installing google-auth-oauthlib...")
        os.system(f"{sys.executable} -m pip install google-auth-oauthlib")
        from google_auth_oauthlib.flow import InstalledAppFlow

    # Accept client secret path as argument
    client_path = sys.argv[1] if len(sys.argv) > 1 else CLIENT_FILE

    if not os.path.exists(client_path):
        print(f"Error: OAuth client file not found: {client_path}")
        print("Download it from Google Cloud Console -> APIs & Services -> Credentials")
        sys.exit(1)

    # Copy to standard location if provided as argument
    os.makedirs(TOKEN_DIR, exist_ok=True)
    if client_path != CLIENT_FILE:
        import shutil
        shutil.copy2(client_path, CLIENT_FILE)
        print(f"Copied client credentials to {CLIENT_FILE}")

    # Run OAuth flow
    print("\nOpening browser for Google OAuth consent...")
    print("Log in with the Google account that owns your Google Sheets.\n")

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    # Save tokens
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())

    print(f"\nTokens saved to {TOKEN_FILE}")
    print("Google Drive & Sheets auth complete.")


if __name__ == "__main__":
    main()
