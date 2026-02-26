@echo off
echo Stopping Tele Agent K...

:: Kill node
taskkill /IM node.exe /F 2>nul

echo.
echo Agent K stopped.
pause
