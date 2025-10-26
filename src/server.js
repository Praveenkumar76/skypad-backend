const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { connectToDatabase } = require('./db/mongoose');
const { initializeSocketServer } = require('./socketServer');

// Initialize Passport
const passport = require('./config/passport');

const app = express();
const httpServer = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware

// Handle CORS preflight for all routes
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Initialize Passport middleware
app.use(passport.initialize());
// Note: We don't use passport.session() because we're using JWT tokens instead of sessions

// Routers
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const problemsRouter = require('./routes/problem');
const challengesRouter = require('./routes/challenges');
const contestsRouter = require('./routes/contests');
const rewardsRouter = require('./routes/rewards');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/contests', contestsRouter);
app.use('/api/rewards', rewardsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('../package.json').version
  });
});

// Root route (avoid 404 when visiting http://localhost:5000)
app.get('/', (_req, res) => {
  res.type('text').send('SkyPad-IDE API is running');
});

const PORT = process.env.PORT || 5000;
const CODE_EDITOR_PORT = process.env.CODE_EDITOR_PORT || 4000;

// Initialize Socket.io
initializeSocketServer(httpServer);

// Function to start the code editor server
let codeEditorProcess = null;
function startCodeEditorServer() {
  console.log('\n🚀 Starting Code Editor Server...');
  
  const codeEditorPath = path.join(__dirname, 'codeEditorServer.js');
  
  // Use nodemon in development, node in production
  const isDev = process.env.NODE_ENV !== 'production';
  const command = isDev ? 'nodemon' : 'node';
  const args = [codeEditorPath];
  
  codeEditorProcess = spawn(command, args, {
    stdio: 'inherit', // Inherit stdio to see logs
    shell: true,
    env: { ...process.env, PORT: CODE_EDITOR_PORT }
  });
  
  codeEditorProcess.on('error', (error) => {
    console.error('❌ Failed to start Code Editor Server:', error.message);
  });
  
  codeEditorProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`⚠️  Code Editor Server exited with code ${code}`);
    }
  });
  
  console.log(`✅ Code Editor Server starting on port ${CODE_EDITOR_PORT}`);
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down servers...');
  if (codeEditorProcess) {
    codeEditorProcess.kill();
  }
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down servers...');
  if (codeEditorProcess) {
    codeEditorProcess.kill();
  }
  process.exit();
});

connectToDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`\n✅ Backend listening on http://localhost:${PORT}`);
    console.log(`✅ WebSocket server ready`);
    
    // Start code editor server after main server is running
    startCodeEditorServer();
  });
}).catch((error) => {
  console.warn('⚠️  Database connection failed, but starting server anyway:', error.message);
  httpServer.listen(PORT, () => {
    console.log(`\n✅ Backend listening on http://localhost:${PORT} (without database)`);
    console.log(`✅ WebSocket server ready`);
    
    // Start code editor server even if DB connection fails
    startCodeEditorServer();
  });
});


