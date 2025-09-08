const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { connectToDatabase } = require('./db/mongoose');

const app = express();

// --- START: CORS CONFIGURATION FIX ---

// 1. Define the list of domains that are allowed to access your backend.
const allowedOrigins = [
  'http://localhost:3000',          // Common local development port for React
  'http://localhost:5173',          // Common local development port for Vite
  'https://sky-pad-ide.vercel.app'  // Your deployed frontend URL
];

// 2. Create the CORS options object.
const corsOptions = {
  origin: (origin, callback) => {
    // The 'origin' is the URL of the site making the request (e.g., your Vercel URL).
    // We check if this origin is in our allowed list.
    // '!origin' allows server-to-server requests (like from Postman or other tools).
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // This allows the frontend to send cookies and authorization headers.
  optionsSuccessStatus: 200 // For legacy browser support.
};

// 3. Apply the CORS middleware with the new options.
// This single configuration handles all requests, including pre-flight OPTIONS requests.
app.use(cors(corsOptions));

// --- END: CORS CONFIGURATION FIX ---


// --- Other Middleware (no changes needed here) ---
app.use(express.json());
app.use(helmet({
  // Allow cross-origin fetches of API responses from the frontend dev server
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('dev'));

// Return JSON for malformed JSON bodies instead of HTML Bad Request
app.use((err, _req, res, next) => {
  if (err && err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  return next(err);
});


// --- Routers (no changes needed here) ---
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const problemsRouter = require('./routes/problems');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);


// --- Health check and Root Route (no changes needed here) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.type('text').send('SkyPad-IDE API is running');
});

// Fallback 404 in JSON for unknown API routes
app.use('/api', (req, res) => {
  return res.status(404).json({ message: 'Not Found' });
});


// --- Server Start Logic (no changes needed here) ---
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