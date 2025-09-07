#!/bin/bash

# SkyPad IDE Backend Deployment Script for Render

echo "🚀 Starting SkyPad IDE Backend Deployment..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install pm2 -g
fi

# Create logs directory
mkdir -p logs

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start services with PM2
echo "🔄 Starting services with PM2..."
pm2 start ecosystem.config.js --no-daemon

echo "✅ Deployment complete!"
echo "🌐 Main API: http://localhost:5000"
echo "💻 Code Editor: http://localhost:5001"
echo "🏥 Health Check: http://localhost:5000/api/health"

# Show PM2 status
pm2 status
