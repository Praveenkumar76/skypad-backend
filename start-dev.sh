#!/bin/bash

echo "🚀 Starting SkyPad IDE Backend in Development Mode..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp env.example .env
    echo "✅ Please edit .env file with your configuration"
    read -p "Press Enter to continue..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create logs directory
mkdir -p logs

# Start both services
echo "🔄 Starting development servers..."
echo "🌐 Main API will be available at: http://localhost:5000"
echo "💻 Code Editor will be available at: http://localhost:5001"
echo "🏥 Health Check: http://localhost:5000/api/health"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start both services concurrently
npm run dev:all
