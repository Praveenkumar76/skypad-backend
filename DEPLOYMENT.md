# SkyPad IDE Backend - Deployment Guide

This guide covers multiple deployment options for the SkyPad IDE backend service.

## 🚀 Quick Start

### Option 1: Render (Recommended for Production)

1. **Prepare Repository**
   ```bash
   git add .
   git commit -m "Add Render deployment configuration"
   git push origin main
   ```

2. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Use these settings:
     - **Root Directory**: `backend`
     - **Build Command**: `npm install && npm install pm2 -g`
     - **Start Command**: `pm2 start ecosystem.config.js --no-daemon`

3. **Set Environment Variables**
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: Generate a secure random string
   - `PORT`: `5000`
   - `CODE_EDITOR_PORT`: `5001`

### Option 2: Docker (Local/Cloud)

1. **Build and Run**
   ```bash
   cd backend
   docker-compose up -d
   ```

2. **Or with Docker directly**
   ```bash
   docker build -t skypad-backend .
   docker run -p 5000:5000 -p 5001:5001 -e MONGODB_URI=your-connection-string skypad-backend
   ```

### Option 3: PM2 (VPS/Server)

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   npm install pm2 -g
   ```

2. **Start Services**
   ```bash
   # Windows
   deploy.bat
   
   # Linux/Mac
   chmod +x deploy.sh
   ./deploy.sh
   ```

## 📋 Prerequisites

### Required
- Node.js 18+ 
- MongoDB (Atlas recommended for production)
- Git repository

### Optional
- Docker & Docker Compose
- PM2 (for process management)
- Render account (for cloud hosting)

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | Yes | `development` |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `PORT` | Main API port | No | `5000` |
| `CODE_EDITOR_PORT` | Code editor port | No | `5001` |
| `CORS_ORIGINS` | Allowed CORS origins | No | `*` |

### MongoDB Setup

1. **MongoDB Atlas (Recommended)**
   - Create account at [MongoDB Atlas](https://cloud.mongodb.com)
   - Create cluster
   - Create database user
   - Get connection string
   - Whitelist IP addresses

2. **Local MongoDB**
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   
   # Or install MongoDB locally
   # Follow MongoDB installation guide for your OS
   ```

## 🌐 Service Endpoints

### Main API (Port 5000)
- `GET /api/health` - Health check
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/problems` - Get problems
- `POST /api/problems` - Create problem

### Code Editor (Port 5001)
- WebSocket server for real-time code collaboration
- Handles code execution and sharing

## 📊 Monitoring

### Health Check
```bash
curl https://your-app.onrender.com/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "0.2.0"
}
```

### PM2 Monitoring
```bash
pm2 status
pm2 logs
pm2 monit
```

### Logs
- Main API: `./logs/out.log`, `./logs/err.log`
- Code Editor: `./logs/code-editor-out.log`, `./logs/code-editor-err.log`

## 🔒 Security

### Production Checklist
- [ ] Use strong JWT secrets
- [ ] Configure CORS properly
- [ ] Enable HTTPS
- [ ] Use environment variables for secrets
- [ ] Regular dependency updates
- [ ] Database access restrictions
- [ ] Rate limiting (consider adding)

### Environment Security
```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Set CORS origins (comma-separated)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Fails**
   - Check Node.js version (18+ required)
   - Verify package.json dependencies
   - Check for syntax errors

2. **Database Connection**
   - Verify MongoDB URI format
   - Check network connectivity
   - Verify database credentials

3. **Port Conflicts**
   - Ensure ports 5000 and 5001 are available
   - Check firewall settings
   - Verify port configuration

4. **CORS Errors**
   - Update CORS_ORIGINS environment variable
   - Check frontend URL configuration
   - Verify CORS middleware setup

### Debug Commands

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs skypad-backend
pm2 logs skypad-code-editor

# Restart services
pm2 restart all

# Stop services
pm2 stop all

# Delete services
pm2 delete all
```

## 📈 Scaling

### Horizontal Scaling
- Use load balancer (nginx, HAProxy)
- Multiple PM2 instances
- Database clustering
- Redis for session management

### Vertical Scaling
- Increase memory limits in ecosystem.config.js
- Upgrade server resources
- Optimize database queries
- Implement caching

## 🔄 Updates

### Rolling Updates
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Restart services
pm2 restart all
```

### Zero-Downtime Deployment
```bash
# Start new instance
pm2 start ecosystem.config.js --only skypad-backend-new

# Switch traffic (using load balancer)
# Stop old instance
pm2 stop skypad-backend
pm2 delete skypad-backend
```

## 📞 Support

For deployment issues:
1. Check logs first
2. Verify environment variables
3. Test health endpoints
4. Check service status
5. Review this documentation

## 🎯 Performance Tips

1. **Database Optimization**
   - Use indexes on frequently queried fields
   - Implement connection pooling
   - Monitor query performance

2. **Memory Management**
   - Set appropriate PM2 memory limits
   - Monitor memory usage
   - Implement garbage collection optimization

3. **Caching**
   - Implement Redis for session storage
   - Cache frequently accessed data
   - Use CDN for static assets

4. **Monitoring**
   - Set up application monitoring
   - Implement error tracking
   - Monitor performance metrics
