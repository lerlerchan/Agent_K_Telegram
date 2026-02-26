#!/bin/zsh
# Start Agent K Telegram Bot
# Run in a separate terminal: ~/Agent_K_Telegram/start.sh

unset CLAUDECODE

cd "$(dirname "$0")"

# Kill any existing Agent K process
pkill -f "node.*src/index.js" 2>/dev/null
sleep 1

echo "🤖 Starting Agent K in $(pwd)..."
echo "   Press Ctrl+C to stop"
echo ""

node src/index.js
