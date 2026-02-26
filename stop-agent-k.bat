@echo off
echo Stopping Tele Agent K...

:: Kill cloudflared
taskkill /IM cloudflared.exe /F 2>nul

:: Kill node
taskkill /IM node.exe /F 2>nul

echo.
echo All services stopped.
pause
