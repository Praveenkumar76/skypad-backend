const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { connectToDatabase } = require('./db/mongoose');

// --- 1. SETUP EXPRESS APP & HTTP SERVER ---
const app = express();
const server = http.createServer(app); // Use http server to attach Socket.IO

// --- 2. UNIFIED CORS CONFIGURATION ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sky-pad-ide.vercel.app' // Your deployed frontend
];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// --- 3. MIDDLEWARE ---
app.use(cors(corsOptions));
app.use(express.json());
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan('dev'));

// --- 4. API ROUTERS ---
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const problemsRouter = require('./routes/problems');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);

// --- 5. SETUP AND ATTACH SOCKET.IO ---
const io = new Server(server, {
  cors: corsOptions
});

// --- 6. CODE EDITOR LOGIC (MERGED FROM codeEditorServer.js) ---

let currentState = { code: "// Start coding here...", language: "javascript" };

async function createTempFile(code, extension) {
  const fileName = `temp_${Date.now()}${extension}`;
  const filePath = path.join(__dirname, fileName);
  await fs.writeFile(filePath, code);
  return filePath;
}

async function deleteTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error deleting temp file:', error);
  }
}

async function executeCode(code, language) {
    // Note: Code execution logic is complex and environment-dependent.
    // This is a simplified version. For production, consider sandboxed environments like Docker.
    let filePath;
    try {
        switch (language) {
            case 'javascript':
                return new Promise((resolve) => {
                    try {
                        const result = eval(code); // Note: eval is insecure for untrusted code
                        resolve({ success: true, output: result !== undefined ? String(result) : 'Execution finished.' });
                    } catch (e) {
                        resolve({ success: false, output: e.message });
                    }
                });
            case 'python':
                filePath = await createTempFile(code, '.py');
                return new Promise((resolve) => {
                    exec(`python ${filePath}`, { timeout: 10000 }, (err, stdout, stderr) => {
                        deleteTempFile(filePath);
                        if (err) resolve({ success: false, output: stderr || err.message });
                        else resolve({ success: true, output: stdout });
                    });
                });
            // Add cases for 'cpp', 'java', 'c' here if needed
            default:
                return { success: false, output: `Language "${language}" is not supported.` };
        }
    } catch (error) {
        if (filePath) await deleteTempFile(filePath);
        return { success: false, output: `An execution error occurred: ${error.message}` };
    }
}


io.on('connection', (socket) => {
  console.log('✅ A user connected to the code editor');
  socket.emit('initial-code', currentState);

  socket.on('code-change', (data) => {
    currentState = data;
    socket.broadcast.emit('code-update', data);
  });

  socket.on('run-code', async (data) => {
    console.log(`Executing ${data.language} code...`);
    const result = await executeCode(data.code, data.language);
    io.emit('run-result', result); // Emit to all clients
  });

  socket.on('disconnect', () => {
    console.log('❌ A user disconnected from the code editor');
  });
});

// --- 5b. INTERVIEW COLLABORATION NAMESPACE ---
// Real-time collaborative editor and chat using Socket.IO rooms keyed by sessionId
const interviewNamespace = io.of('/interview');

interviewNamespace.on('connection', (socket) => {
  // Join a specific interview session room
  socket.on('join-session', ({ sessionId, user }) => {
    try {
      if (!sessionId) return;
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      interviewNamespace.to(sessionId).emit('system', { type: 'join', user, timestamp: Date.now() });
    } catch (e) {
      // no-op
    }
  });

  // Broadcast code changes to everyone else in the same session
  socket.on('code-change', ({ sessionId, code, language }) => {
    if (!sessionId) return;
    socket.to(sessionId).emit('code-update', { code, language });
  });

  // Execute code on server and return result to the room
  socket.on('run-code', async ({ sessionId, code, language }) => {
    if (!sessionId) return;
    const result = await executeCode(code, language);
    interviewNamespace.to(sessionId).emit('run-result', result);
  });

  // Chat message relay within the room
  socket.on('chat-message', ({ sessionId, message }) => {
    if (!sessionId || !message) return;
    interviewNamespace.to(sessionId).emit('chat-message', message);
  });
});

// --- 7. HEALTH CHECKS & FINAL ROUTES ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.type('text').send('SkyPad-IDE Unified Server is running');
});

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// --- 8. START THE UNIFIED SERVER ---
const PORT = process.env.PORT || 5000;

connectToDatabase().then(() => {
  server.listen(PORT, () => { // IMPORTANT: Use server.listen, not app.listen
    console.log(`[MongoDB] Connected`);
    console.log(`🚀 Unified Backend listening on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.warn('Database connection failed:', error.message);
  server.listen(PORT, () => {
    console.log(`🚀 Unified Backend listening on http://localhost:${PORT} (without database)`);
  });
});