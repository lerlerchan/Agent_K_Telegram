@echo off
echo Starting Tele Agent K...

:: Start Cloudflare Tunnel in a new window
start "Cloudflare Tunnel" powershell -NoExit -Command "cloudflared tunnel run agent-k"

:: Wait 3 seconds for tunnel to connect
timeout /t 3 /nobreak > nul

:: Start the bot in a new window
start "Agent K Bot" powershell -NoExit -Command "cd 'C:\Users\khjan\Downloads\Tele Agent K'; npm start"

echo.
echo Both services started!
echo - Window 1: Cloudflare Tunnel
echo - Window 2: Agent K Bot
echo.
echo You can close this window.
pause
