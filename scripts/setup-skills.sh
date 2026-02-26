#!/bin/bash
# setup-skills.sh — Symlink repo skills to ~/.claude/skills/
# Idempotent: safe to run multiple times.

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO_DIR/skills"
TARGET="$HOME/.claude/skills"

echo "Setting up skills symlink..."

# Already correct symlink?
if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "$SKILLS_DIR" ]; then
  echo "  Already linked: $TARGET -> $SKILLS_DIR"
  echo "  Nothing to do."
  exit 0
fi

# Symlink exists but points elsewhere
if [ -L "$TARGET" ]; then
  echo "  Removing stale symlink: $TARGET -> $(readlink "$TARGET")"
  rm "$TARGET"
fi

# Real directory with files — back it up
if [ -d "$TARGET" ]; then
  BACKUP="$HOME/.claude/skills.bak.$(date +%Y%m%d%H%M%S)"
  echo "  Backing up existing skills to: $BACKUP"
  mv "$TARGET" "$BACKUP"
fi

# Create parent directory if needed
mkdir -p "$(dirname "$TARGET")"

# Create symlink
ln -s "$SKILLS_DIR" "$TARGET"
echo "  Created symlink: $TARGET -> $SKILLS_DIR"

# Verify
if [ -d "$TARGET" ] && [ -f "$TARGET/compact/SKILL.md" ]; then
  SKILL_COUNT=$(ls -d "$TARGET"/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')
  echo "  Verified: $SKILL_COUNT skills available."
else
  echo "  WARNING: Symlink created but verification failed."
  exit 1
fi
