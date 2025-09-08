@echo off
echo Setting up MongoDB for SkyPad IDE...
echo.

echo Option 1: Install MongoDB Community Server
echo Download from: https://www.mongodb.com/try/download/community
echo.

echo Option 2: Use Docker (if Docker Desktop is running)
echo docker run -d -p 27017:27017 --name mongodb mongo:latest
echo.

echo Option 3: Use MongoDB Atlas (cloud)
echo 1. Go to https://cloud.mongodb.com
echo 2. Create free cluster
echo 3. Get connection string
echo 4. Update .env file with your connection string
echo.

echo Current .env file contents:
type .env
echo.

echo To start MongoDB manually:
echo 1. Install MongoDB Community Server
echo 2. Start MongoDB service: net start MongoDB
echo 3. Or run: "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
echo.

pause
