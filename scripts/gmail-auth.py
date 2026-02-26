#!/usr/bin/env python3
"""Gmail OAuth setup — opens browser for consent, saves tokens."""

import json
import os
import sys

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic",
]
TOKEN_DIR = os.path.expanduser("~/.gmail-mcp")
CLIENT_FILE = os.path.join(TOKEN_DIR, "gcp-oauth.keys.json")
CREDS_FILE = os.path.join(TOKEN_DIR, "credentials.json")


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
    print("Log in with the Gmail account you want the agent to use.\n")

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    # Save tokens
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": SCOPES,
    }
    with open(CREDS_FILE, "w") as f:
        json.dump(token_data, f, indent=2)

    print(f"\nTokens saved to {CREDS_FILE}")
    print("Gmail auth complete.")


if __name__ == "__main__":
    main()
