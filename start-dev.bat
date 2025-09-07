@echo off
echo 🚀 Starting SkyPad IDE Backend in Development Mode...

REM Check if .env file exists
if not exist .env (
    echo ⚠️  .env file not found. Creating from template...
    copy env.example .env
    echo ✅ Please edit .env file with your configuration
    pause
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Create logs directory
if not exist logs mkdir logs

REM Start both services
echo 🔄 Starting development servers...
echo 🌐 Main API will be available at: http://localhost:5000
echo 💻 Code Editor will be available at: http://localhost:5001
echo 🏥 Health Check: http://localhost:5000/api/health
echo.
echo Press Ctrl+C to stop all services
echo.

REM Start both services concurrently
npm run dev:all
