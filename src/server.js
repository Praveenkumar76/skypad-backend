const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });


const { connectToDatabase } = require('./db/mongoose');
const { initializeSocketServer } = require('./socketServer');

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

// Routers
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const problemsRouter = require('./routes/problems');
const challengesRouter = require('./routes/challenges');
const contestsRouter = require('./routes/contests');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/contests', contestsRouter);

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

// Initialize Socket.io
initializeSocketServer(httpServer);

connectToDatabase().then(() => {
  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(`WebSocket server ready`);
  });
}).catch((error) => {
  console.warn('Database connection failed, but starting server anyway:', error.message);
  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT} (without database)`);
    console.log(`WebSocket server ready`);
  });
});


