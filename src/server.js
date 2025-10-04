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
  'http://localhost:5174',
  'https://sky-pad-ide.vercel.app',
  'https://sky-pad-ide-sec.vercel.app',
  'https://skypad-ide.vercel.app',  // Add all possible Vercel URLs
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches Vercel pattern
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      console.log('CORS allowing origin:', origin);
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// --- 3. MIDDLEWARE ---
// Apply CORS before other middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // Enable pre-flight for all routes

// Add CORS debugging middleware
app.use((req, res, next) => {
  console.log('Request origin:', req.headers.origin);
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  next();
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({ 
    message: 'CORS is working!', 
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});
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
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
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
            case 'java': {
                // Create a temporary directory to hold Java files and class outputs
                const tempDir = path.join(__dirname, `java_${Date.now()}`);
                await fs.mkdir(tempDir, { recursive: true });
                // Try to detect public class name; default to Main if not found
                const classMatch = code.match(/public\s+class\s+(\w+)/);
                const className = classMatch ? classMatch[1] : 'Main';
                const javaFilePath = path.join(tempDir, `${className}.java`);
                await fs.writeFile(javaFilePath, code);

                return new Promise((resolve) => {
                    // Compile
                    exec(`javac "${javaFilePath}"`, { cwd: tempDir, timeout: 15000 }, async (compileErr, _stdout, compileStderr) => {
                        if (compileErr) {
                            // Cleanup directory
                            try { await fs.rm(tempDir, { recursive: true, force: true }); } catch (_) {}
                            resolve({ success: false, output: compileStderr || compileErr.message });
                            return;
                        }
                        // Run
                        exec(`java -cp . ${className}`, { cwd: tempDir, timeout: 15000 }, async (runErr, runStdout, runStderr) => {
                            // Cleanup directory
                            try { await fs.rm(tempDir, { recursive: true, force: true }); } catch (_) {}
                            if (runErr) resolve({ success: false, output: runStderr || runErr.message });
                            else resolve({ success: true, output: runStdout });
                        });
                    });
                });
            }
            case 'c': {
                // Write to a temporary C file and compile
                const cFilePath = await createTempFile(code, '.c');
                const exePath = cFilePath.replace(/\.c$/, process.platform === 'win32' ? '.exe' : '');
                return new Promise((resolve) => {
                    const compileCmd = process.platform === 'win32'
                        ? `gcc "${cFilePath}" -O2 -std=c11 -o "${exePath}"`
                        : `gcc "${cFilePath}" -O2 -std=c11 -o "${exePath}"`;
                    exec(compileCmd, { timeout: 20000 }, (compileErr, _stdout, compileStderr) => {
                        const runAndCleanup = async () => {
                            try { await deleteTempFile(cFilePath); } catch (_) {}
                        };
                        if (compileErr) {
                            runAndCleanup().then(() => resolve({ success: false, output: compileStderr || compileErr.message }));
                            return;
                        }
                        const runCmd = process.platform === 'win32' ? `"${exePath}"` : `"${exePath}"`;
                        exec(runCmd, { timeout: 15000 }, async (runErr, runStdout, runStderr) => {
                            await runAndCleanup();
                            // Also remove the compiled binary
                            try { await fs.unlink(exePath); } catch (_) {}
                            if (runErr) resolve({ success: false, output: runStderr || runErr.message });
                            else resolve({ success: true, output: runStdout });
                        });
                    });
                });
            }
            case 'cpp':
            case 'c++': {
                // Write to a temporary C++ file and compile
                const cppFilePath = await createTempFile(code, '.cpp');
                const exePath = cppFilePath.replace(/\.cpp$/, process.platform === 'win32' ? '.exe' : '');
                return new Promise((resolve) => {
                    const compileCmd = `g++ "${cppFilePath}" -O2 -std=c++17 -o "${exePath}"`;
                    exec(compileCmd, { timeout: 30000 }, (compileErr, _stdout, compileStderr) => {
                        const runAndCleanup = async () => {
                            try { await deleteTempFile(cppFilePath); } catch (_) {}
                        };
                        if (compileErr) {
                            runAndCleanup().then(() => resolve({ success: false, output: compileStderr || compileErr.message }));
                            return;
                        }
                        const runCmd = process.platform === 'win32' ? `"${exePath}"` : `"${exePath}"`;
                        exec(runCmd, { timeout: 15000 }, async (runErr, runStdout, runStderr) => {
                            await runAndCleanup();
                            // Also remove the compiled binary
                            try { await fs.unlink(exePath); } catch (_) {}
                            if (runErr) resolve({ success: false, output: runStderr || runErr.message });
                            else resolve({ success: true, output: runStdout });
                        });
                    });
                });
            }
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

// In-memory participants store per sessionId
const sessionParticipants = new Map(); // Map<string, Array<{id:string,name:string}>>
// In-memory chat history per sessionId
const sessionMessages = new Map(); // Map<string, Array<Message>>

interviewNamespace.on('connection', (socket) => {
  // Join a specific interview session room
  socket.on('join-session', ({ sessionId, user }) => {
    try {
      if (!sessionId) return;
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      if (user?.id) socket.data.userId = user.id;
      interviewNamespace.to(sessionId).emit('system', { type: 'join', user, timestamp: Date.now() });

      // Track participants
      const current = sessionParticipants.get(sessionId) || [];
      const exists = current.find(p => p.id === user?.id);
      let updated;
      if (exists) {
        updated = current.map(p => (p.id === user.id ? { id: user.id, name: user.name } : p));
      } else if (user?.id) {
        updated = [...current, { id: user.id, name: user.name || 'User' }];
      } else {
        updated = current;
      }
      sessionParticipants.set(sessionId, updated);
      interviewNamespace.to(sessionId).emit('participants', updated);

      // Send chat history to the newly joined client
      const history = sessionMessages.get(sessionId) || [];
      socket.emit('chat-history', history);
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
    // Append to session history
    const list = sessionMessages.get(sessionId) || [];
    const normalized = {
      id: message.id || Date.now(),
      sender: message.sender || 'Anonymous',
      content: message.content || '',
      timestamp: message.timestamp || new Date().toISOString()
    };
    const updated = [...list, normalized];
    sessionMessages.set(sessionId, updated);

    interviewNamespace.to(sessionId).emit('chat-message', normalized);
  });

  socket.on('disconnect', () => {
    const sessionId = socket.data.sessionId;
    const userId = socket.data.userId;
    if (!sessionId || !userId) return;
    const current = sessionParticipants.get(sessionId) || [];
    const updated = current.filter(p => p.id !== userId);
    sessionParticipants.set(sessionId, updated);
    interviewNamespace.to(sessionId).emit('participants', updated);
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