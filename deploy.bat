@echo off
echo 🚀 Starting SkyPad IDE Backend Deployment...

REM Check if PM2 is installed
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing PM2...
    npm install pm2 -g
)

REM Create logs directory
if not exist logs mkdir logs

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Start services with PM2
echo 🔄 Starting services with PM2...
pm2 start ecosystem.config.js --no-daemon

echo ✅ Deployment complete!
echo 🌐 Main API: http://localhost:5000
echo 💻 Code Editor: http://localhost:5001
echo 🏥 Health Check: http://localhost:5000/api/health

REM Show PM2 status
pm2 status

pause
