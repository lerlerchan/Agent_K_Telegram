@echo off
echo Starting Agent K Telegram Bot...

:: Clean environment for Claude CLI
set CLAUDECODE=

:: Kill existing Node processes running Agent K
taskkill /f /fi "WINDOWTITLE eq Agent K Bot" >nul 2>&1
timeout /t 1 >nul

:: Start the bot in a new window
start "Agent K Bot" cmd /k "cd /d %~dp0 && node src/index.js"

echo.
echo Agent K started in polling mode!
echo   Window: Agent K Bot
echo   Press Ctrl+C in that window to stop
echo.
pause
