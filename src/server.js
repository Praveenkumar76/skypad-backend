const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });


const { connectToDatabase } = require('./db/mongoose');

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
// Handle CORS preflight for all routes
app.options('*', cors());
app.use(express.json());
app.use(helmet({
  // Allow cross-origin fetches of API responses from the frontend dev server
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('dev'));

// Routers
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const problemsRouter = require('./routes/problems');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root route (avoid 404 when visiting http://localhost:5000)
app.get('/', (_req, res) => {
  res.type('text').send('SkyPad-IDE API is running');
});

const PORT = process.env.PORT || 5000;

connectToDatabase().then(() => {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.warn('Database connection failed, but starting server anyway:', error.message);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${PORT} (without database)`);
  });
});


