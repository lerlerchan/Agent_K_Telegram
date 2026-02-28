---
name: mac-setup
description: "Set up a Mac Mini as a headless Agent K station. Use when user asks to configure a new Mac, set up auto-login, grant Full Disk Access to Terminal/Node, auto-start Agent K or Claude Code CLI on boot, or enable remote control."
---

# Mac Mini Setup — Headless Agent K Station

Guide the user through configuring a fresh Mac Mini so Agent K and Claude Code CLI start automatically on boot with remote access enabled.

## Pre-requisites

Before starting, confirm with the user:
- macOS version (must be Ventura 13+ for latest System Settings paths)
- Whether Agent K repo is already cloned
- Whether Claude Code CLI is already installed

---

## Step 1: Grant Full Disk Access to Terminal & Node

Terminal and Node need Full Disk Access so scripts can read/write across the filesystem without permission popups.

### Instructions for User

> **System Settings → Privacy & Security → Full Disk Access**
>
> 1. Open **System Settings** (Apple menu → System Settings)
> 2. Go to **Privacy & Security** → **Full Disk Access**
> 3. Click the **+** button (authenticate if prompted)
> 4. Add these apps:
>    - **Terminal** — navigate to `/System/Applications/Utilities/Terminal.app`
>    - **Node.js** — navigate to `~/.local/bin/node` (press `Cmd+Shift+G` in the file picker and paste the path)
>    - **iTerm** (if used) — navigate to `/Applications/iTerm.app`
> 5. Ensure the toggles are **ON** for each entry
> 6. Restart Terminal after granting access

**Also grant Accessibility access** (needed for some automation):
> **System Settings → Privacy & Security → Accessibility**
> - Add Terminal (and iTerm if used)

---

## Step 2: Disable Login Password (Auto-Login)

This allows the Mac to boot straight to the desktop without waiting for a password.

### Instructions for User

> **System Settings → Users & Groups → Automatic Login**
>
> 1. Open **System Settings** → **Users & Groups**
> 2. Click the **ℹ️** (info) button next to your user account
> 3. Set **Automatic Login** to your user account
> 4. Enter your password to confirm
> 5. If greyed out, first disable **FileVault**:
>    - Go to **Privacy & Security** → **FileVault** → Turn Off
>    - Wait for decryption to complete (can take hours)
>    - Then return to Users & Groups to enable auto-login

> **Important:** If the Mac uses an Apple ID with iCloud, you may need to:
> - Go to **System Settings → Touch ID & Password** (or **Login Password**)
> - Verify your Apple ID password is not required at login

---

## Step 3: Auto-Start Agent K on Login

Create a Launch Agent plist that starts Agent K automatically when the user logs in.

### Create the plist

Write this file to `~/Library/LaunchAgents/com.aitraining2u.agentk.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aitraining2u.agentk</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/aitraining2u/.local/bin/node</string>
        <string>/Users/aitraining2u/Agent_K_Telegram/bot.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/aitraining2u/Agent_K_Telegram</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/aitraining2u/Library/Logs/agentk.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/aitraining2u/Library/Logs/agentk-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/aitraining2u/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/aitraining2u</string>
    </dict>
</dict>
</plist>
```

### Load the agent

```bash
launchctl load ~/Library/LaunchAgents/com.aitraining2u.agentk.plist
```

### Verify it's running

```bash
launchctl list | grep agentk
```

### To stop/restart manually

```bash
launchctl stop com.aitraining2u.agentk
launchctl start com.aitraining2u.agentk
```

### View logs

```bash
tail -f ~/Library/Logs/agentk.log
tail -f ~/Library/Logs/agentk-error.log
```

---

## Step 4: Auto-Start Claude Code CLI with Remote Control

Start Claude Code CLI in **remote control** mode so it can be controlled from `claude.ai/code` or the Claude mobile app.

### Pre-requisite: Enable Remote Control

Before creating the Launch Agent, the user must enable remote control in Claude Code settings:

> 1. Open a terminal and run `claude`
> 2. Type `/config` inside Claude Code
> 3. Set **"Enable Remote Control for all sessions"** to `true`
> 4. Exit Claude Code

### Option A: Launch Agent (recommended for always-on)

Write this file to `~/Library/LaunchAgents/com.aitraining2u.claudecode.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aitraining2u.claudecode</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/aitraining2u/.local/bin/claude</string>
        <string>remote-control</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/aitraining2u</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/aitraining2u/Library/Logs/claudecode.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/aitraining2u/Library/Logs/claudecode-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/aitraining2u/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/aitraining2u</string>
    </dict>
</dict>
</plist>
```

Load the agent:

```bash
launchctl load ~/Library/LaunchAgents/com.aitraining2u.claudecode.plist
```

### Option B: Login Item script (simpler alternative)

Create a shell script at `~/start-claude-remote.sh`:

```bash
#!/bin/bash
cd ~
~/.local/bin/claude remote-control
```

Make it executable: `chmod +x ~/start-claude-remote.sh`

Then add it as a Login Item:
> **System Settings → General → Login Items & Extensions**
> Click **+** and select `~/start-claude-remote.sh`

### How Remote Control works

- The Mac runs Claude Code locally (sessions execute on your machine)
- You control it remotely via **claude.ai/code** or the **Claude mobile app**
- No inbound ports are opened — it uses outbound HTTPS polling
- Requires a **Claude Max plan** subscription
- Auto-reconnects if network drops (within ~10 minutes)

### Verify remote control is running

```bash
launchctl list | grep claudecode
cat ~/Library/Logs/claudecode.log
```

---

## Step 5: Enable Remote Access (Screen Sharing + SSH)

So the user can control the Mac Mini remotely from another device.

### Instructions for User

> **Screen Sharing (VNC)**
> 1. **System Settings → General → Sharing**
> 2. Turn on **Screen Sharing**
> 3. Click the **ℹ️** button to configure which users can connect
> 4. Note the address shown (e.g., `vnc://192.168.x.x`)
> 5. From another Mac: **Finder → Go → Connect to Server** → enter the VNC address

> **Remote Login (SSH)**
> 1. **System Settings → General → Sharing**
> 2. Turn on **Remote Login**
> 3. Set "Allow access for" to your user or All Users
> 4. Connect from another machine: `ssh aitraining2u@<ip-address>`

> **Remote Management (optional, for Apple Remote Desktop)**
> 1. **System Settings → General → Sharing**
> 2. Turn on **Remote Management**
> 3. Configure allowed privileges (observe, control, etc.)

---

## Step 6: Power & Energy Settings

Ensure the Mac stays awake and recovers from power loss.

### Instructions for User

> **System Settings → Energy**
> 1. Set **Turn display off after** → Never (or a long interval)
> 2. Enable **Prevent automatic sleeping when the display is off**
> 3. Enable **Start up automatically after a power failure**
> 4. Enable **Wake for network access**

Or apply via terminal:

```bash
# Prevent sleep
caffeinate -d &

# Auto-restart after power failure (requires admin, not sudo)
# This is set in System Settings → Energy → Start up automatically after power failure
```

> **pmset command (if user has admin access):**
> ```bash
> sudo pmset -a displaysleep 0 sleep 0 disksleep 0 autorestart 1 womp 1
> ```
> Note: `sudo` may not be available — use System Settings GUI instead.

---

## Step 7: Verify Everything Works

After completing all steps, guide the user to verify:

1. **Reboot the Mac** — it should auto-login to the desktop
2. **Check Agent K** — `launchctl list | grep agentk` should show the process
3. **Check Claude Code** — `launchctl list | grep claudecode` should show the process
4. **Test remote access** — SSH or Screen Share from another device
5. **Send a test message** to Agent K via Telegram to confirm it responds
6. **Check logs** for any errors:
   ```bash
   cat ~/Library/Logs/agentk.log
   cat ~/Library/Logs/agentk-error.log
   ```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Auto-login greyed out | Disable FileVault first (Step 2) |
| Agent K won't start | Check `node` path: `which node` and update plist |
| Permission denied errors | Ensure Full Disk Access is granted (Step 1) |
| Mac sleeps despite settings | Check Energy settings, use `caffeinate -d &` |
| LaunchAgent not loading | Check plist syntax: `plutil -lint ~/Library/LaunchAgents/com.aitraining2u.agentk.plist` |
| Claude Code remote not working | Run `claude --help` to verify remote/headless flags |

---

## Adapting for a Different User

If setting up a Mac for a different username, update ALL paths in the plist files:
- Replace `/Users/aitraining2u` with `/Users/<username>`
- Update the `HOME` environment variable
- Update the `WorkingDirectory`
- Update log file paths
