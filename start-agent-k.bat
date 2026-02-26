@echo off
echo Starting Tele Agent K...

:: Start the bot in a new window
start "Agent K Bot" powershell -NoExit -Command "cd 'C:\Users\khjan\Downloads\Agent_K_Telegram-main'; npm start"

echo.
echo Agent K started in polling mode!
echo - Window: Agent K Bot
echo.
echo You can close this window.
pause
