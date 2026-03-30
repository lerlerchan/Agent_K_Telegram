# Restore Agent K Claude Config

Run these commands on a fresh machine after cloning the repo:

```bash
# 1. Restore identity/soul
mkdir -p ~/.claude
cp backup/claude-config/CLAUDE.md ~/.claude/CLAUDE.md

# 2. Restore memory
MEMORY_DIR=~/.claude/projects/-home-lerler-github-Agent-K-Telegram/memory
mkdir -p "$MEMORY_DIR/daily"
cp backup/claude-config/memory/MEMORY.md "$MEMORY_DIR/"
cp backup/claude-config/memory/*.md "$MEMORY_DIR/" 2>/dev/null
cp backup/claude-config/memory/daily/*.md "$MEMORY_DIR/daily/" 2>/dev/null

# 3. Restore skills (symlink from repo)
./scripts/setup-skills.sh

# 4. Restore .env (copy from Windows D: drive)
# Mount D: first:  sudo mount /dev/sda4 /mnt/windows-d
# Then:            cp /mnt/windows-d/AgentK-backup/.env .env

# 5. Restore GitHub PAT
mkdir -p ~/.claude/credentials
# Paste your PAT into:  ~/.claude/credentials/github-pat
```
