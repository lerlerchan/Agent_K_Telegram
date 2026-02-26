---
name: git-push
description: Commit and push code to GitHub. Use when user asks to push, commit and push, or deploy code to git/GitHub.
---

Push local commits to a GitHub repository using the stored PAT (classic token) for `atlas-aitraining2u`.

## Auth

- PAT stored at: `~/.claude/credentials/github-pat`
- GitHub user: `atlas-aitraining2u`
- Token type: Classic (repo scope — works on owned + collaborator repos)

## Workflow

### 1. Check State
```bash
cd REPO_DIR
git status
git log --oneline -5
git remote -v
```
- Confirm there are changes to commit (if not already committed)
- Identify the remote URL and branch

### 2. Commit (if uncommitted changes exist)
- Stage relevant files (never stage `.env`, credentials, or secrets)
- Write a concise commit message summarizing the changes
- Always append `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

### 3. Push
Read the PAT and temporarily inject into the remote URL, push, then restore:
```bash
PAT=$(cat ~/.claude/credentials/github-pat)
REMOTE_URL=$(git remote get-url origin)

# Extract owner/repo from HTTPS or SSH URL
# HTTPS: https://github.com/OWNER/REPO.git
# SSH: git@github.com:OWNER/REPO.git
REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's#(https://github.com/|git@github.com:)##' | sed 's/.git$//')

# Push with PAT
git remote set-url origin "https://atlas-aitraining2u:${PAT}@github.com/${REPO_PATH}.git"
git push origin HEAD
PUSH_EXIT=$?

# Always restore clean remote URL (no token)
git remote set-url origin "https://github.com/${REPO_PATH}.git"

# Report result
if [ $PUSH_EXIT -eq 0 ]; then
  echo "Pushed successfully to https://github.com/${REPO_PATH}"
else
  echo "Push failed (exit $PUSH_EXIT)"
fi
```

### 4. Verify
```bash
git log --oneline -3
git status
```

## Rules
- **NEVER** leave the PAT in the remote URL after pushing — always restore the clean URL
- **NEVER** echo or display the PAT in output
- **NEVER** commit `.env`, credentials, tokens, or secret files
- **NEVER** force push unless user explicitly requests it
- If push fails with 403, check: collaborator access, PAT expiry, repo visibility
- Default branch: push to whatever branch is currently checked out
- If user says "push" without specifying a repo, use the current working directory

## Arguments
- `$ARGUMENTS` = optional: repo path, branch name, or commit message
- If no repo path given, use current directory
- If no commit message given and there are uncommitted changes, draft one from the diff
