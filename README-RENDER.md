# SkyPad IDE Backend - Render Deployment

This guide explains how to deploy the SkyPad IDE backend to Render using PM2.

## Prerequisites

- Render account
- MongoDB Atlas account (for production database)
- Git repository with the backend code

## Deployment Steps

### 1. Prepare the Repository

Make sure your backend directory contains:
- `ecosystem.config.js` - PM2 configuration
- `render.yaml` - Render service configuration
- `package.json` - Updated with render scripts
- `env.example` - Environment variables template

### 2. Create MongoDB Atlas Database

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a new cluster
3. Create a database user
4. Get the connection string
5. Whitelist Render's IP ranges (0.0.0.0/0 for development)

### 3. Deploy to Render

#### Option A: Using Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Configure the service:
   - **Name**: `skypad-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm install pm2 -g`
   - **Start Command**: `pm2 start ecosystem.config.js --no-daemon`
   - **Health Check Path**: `/api/health`

5. Add Environment Variables:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: Generate a secure random string
   - `PORT`: `5000`
   - `CODE_EDITOR_PORT`: `5001`

#### Option B: Using render.yaml (Infrastructure as Code)

1. Push your code to Git repository
2. In Render Dashboard, go to "Blueprints"
3. Click "New Blueprint"
4. Connect your repository
5. Render will automatically detect and deploy using `render.yaml`

### 4. Verify Deployment

1. Check the service logs in Render dashboard
2. Test the health endpoint: `https://your-app.onrender.com/api/health`
3. Verify both services are running:
   - Main API: `https://your-app.onrender.com/api/`
   - Code Editor: `https://your-app.onrender.com:5001/`

### 5. Update Frontend Configuration

Update your frontend API calls to use the Render URL:

```javascript
// In your frontend code
const API_BASE_URL = 'https://your-app.onrender.com/api';
const CODE_EDITOR_URL = 'https://your-app.onrender.com:5001';
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | Yes | `production` |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `PORT` | Main API port | No | `5000` |
| `CODE_EDITOR_PORT` | Code editor port | No | `5001` |
| `CORS_ORIGINS` | Allowed CORS origins | No | `*` |

## PM2 Configuration

The `ecosystem.config.js` file configures two PM2 processes:

1. **skypad-backend**: Main API server
2. **skypad-code-editor**: Code editor WebSocket server

Both processes will:
- Restart automatically on crashes
- Log to separate files
- Use memory limits
- Run in production mode

## Monitoring

- Check logs in Render dashboard
- Monitor memory usage
- Set up alerts for crashes
- Use PM2 monitoring: `pm2 monit` (if accessing server directly)

## Troubleshooting

### Common Issues

1. **Build Fails**: Check Node.js version compatibility
2. **Database Connection**: Verify MongoDB Atlas connection string
3. **Port Issues**: Ensure ports are properly configured
4. **CORS Errors**: Update CORS_ORIGINS environment variable

### Logs Location

- Main API logs: `./logs/out.log`, `./logs/err.log`
- Code Editor logs: `./logs/code-editor-out.log`, `./logs/code-editor-err.log`

### Health Check

The service exposes a health check endpoint at `/api/health` that returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Scaling

For production scaling:
1. Upgrade to a paid Render plan
2. Increase memory limits in ecosystem.config.js
3. Consider using Render's database services
4. Implement proper logging and monitoring

## Security

- Use strong JWT secrets
- Configure CORS properly
- Use HTTPS (enabled by default on Render)
- Regularly update dependencies
- Monitor for security vulnerabilities
