@echo off
echo Stopping existing Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting backend server...
cd /d "%~dp0"
start "SkyPad Backend" npm run dev

echo Server restarting...
echo Check the new window for server status
pause
