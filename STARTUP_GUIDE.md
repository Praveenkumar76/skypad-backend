# SkyPad-IDE Backend Startup Guide

## 🚀 Starting the Server

The backend now **automatically starts the Code Editor Server** when you run it!

### Development Mode (with auto-reload)

```bash
npm run dev
```

This will start:
- ✅ Main backend server on `http://localhost:5000`
- ✅ Code Editor server on `http://localhost:4000` (automatic)
- ✅ WebSocket server for real-time features
- ✅ Both servers with auto-reload (using nodemon)

### Production Mode

```bash
npm start
```

This will start:
- ✅ Main backend server on `http://localhost:5000`
- ✅ Code Editor server on `http://localhost:4000` (automatic)
- ✅ WebSocket server for real-time features

## ⚙️ Configuration

You can customize the ports in `.env`:

```env
PORT=5000                # Main backend server port
CODE_EDITOR_PORT=4000    # Code editor server port
```

## 🛑 Stopping the Servers

Press `Ctrl+C` in the terminal. Both servers will shut down gracefully.

## 📝 What Changed?

### Before:
You had to run two separate commands:
```bash
npm run dev              # Terminal 1 - Main server
npm run dev:code-editor  # Terminal 2 - Code editor server
```

### After:
Just run one command:
```bash
npm run dev              # Starts both servers automatically!
```

## 🔍 Logs

You'll see logs from both servers in the same terminal:
- Main backend logs appear normally
- Code editor logs appear with timestamps and clear indicators

## ✨ Features

1. **Automatic Startup**: Code editor server starts automatically with the main server
2. **Graceful Shutdown**: Both servers shut down cleanly when you press Ctrl+C
3. **Environment-aware**: Uses `nodemon` in development, `node` in production
4. **Error Handling**: Shows clear error messages if either server fails
5. **Port Configuration**: Easily configure ports via `.env` file

## 🧪 Testing

After starting the server, verify both are running:

1. **Main Backend**: http://localhost:5000
   - Should show: "SkyPad-IDE API is running"

2. **Code Editor**: http://localhost:4000/health
   - Should return: `{"status":"OK","service":"Code Editor Backend",...}`

3. **WebSocket**: Connect from your frontend to:
   - Main WebSocket: `ws://localhost:5000`
   - Code Editor WebSocket: `ws://localhost:4000`

## ⚠️ Troubleshooting

### Port Already in Use
If you get "EADDRINUSE" error:
```bash
# Kill the process using the port (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Or change the port in .env
PORT=5001
CODE_EDITOR_PORT=4001
```

### Code Editor Won't Start
- Check if `nodemon` is installed: `npm install`
- Check `src/codeEditorServer.js` exists
- Look for error messages in the console

## 📚 Additional Commands

- `npm run start:production` - Production mode (no nodemon)
- `npm run dev:all` - Alternative using concurrently (legacy)
