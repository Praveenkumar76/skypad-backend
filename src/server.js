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
const contestsRouter = require('./routes/contests');
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/problems', problemsRouter);
app.use('/api/contests', contestsRouter);

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

// --- 5c. CHALLENGE DUEL NAMESPACE ---
// Lightweight real-time room sync for two-player problem-solving duels
const challengeNamespace = io.of('/challenge');

// In-memory room store keyed by roomId
// Structure: { id, name, host, players: [{id,name,email,joinedAt}], status, createdAt, selectedProblem, scores, waitingEndsAt, challengeEndsAt, endedAt, winnerId }
const challengeRooms = new Map();

function getChallengeDurationSeconds(problemDifficulty) {
  const map = { Easy: 15 * 60, Medium: 30 * 60, Hard: 50 * 60 };
  return map[problemDifficulty] || 30 * 60;
}

function computeReward(problemDifficulty) {
  const rewardMap = { Easy: 10, Medium: 20, Hard: 30 };
  return rewardMap[problemDifficulty] || 20;
}

function pruneEmptyRoom(roomId) {
  const room = challengeRooms.get(roomId);
  if (!room) return;
  const players = room.players || [];
  if (players.length === 0) {
    challengeRooms.delete(roomId);
  }
}

challengeNamespace.on('connection', (socket) => {
  // Client requests to join a room
  socket.on('join-room', ({ roomId, user }) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.data.roomId = roomId;
    const nowIso = new Date().toISOString();

    let room = challengeRooms.get(roomId);
    if (!room) {
      // Create new room with waiting window of 120s
      room = {
        id: roomId,
        name: `Room ${String(roomId).slice(0, 8)}`,
        host: user?.id,
        players: [],
        status: 'waiting',
        createdAt: nowIso,
        selectedProblem: null,
        scores: {},
        waitingEndsAt: new Date(Date.now() + 120000).toISOString(),
      };
      challengeRooms.set(roomId, room);
    }

    // Add/update player if capacity (<2)
    const exists = room.players.find((p) => p.id === user?.id);
    if (!exists && room.players.length < 2 && user?.id) {
      room.players.push({
        id: user.id,
        name: user.name || 'Player',
        email: user.email || '',
        joinedAt: nowIso,
      });
    }

    // If host missing, set to first player
    if (!room.host && room.players[0]) {
      room.host = room.players[0].id;
    }

    // Emit current state to everyone
    challengeNamespace.to(roomId).emit('room-state', room);
  });

  // Host selects a problem to start the challenge
  socket.on('select-problem', ({ roomId, problem }) => {
    if (!roomId || !problem) return;
    const room = challengeRooms.get(roomId);
    if (!room) return;

    // Only host can start
    const isHost = socket.handshake?.auth?.userId === room.host || socket.data.userId === room.host;
    // If we cannot validate via socket auth, allow selection but rely on client UI to restrict

    const difficulty = problem.difficulty || 'Medium';
    const durationSec = getChallengeDurationSeconds(difficulty);
    const challengeEndsAt = new Date(Date.now() + durationSec * 1000).toISOString();

    // Persist minimal problem fields to reduce payload size
    room.selectedProblem = {
      _id: problem._id,
      title: problem.title,
      description: problem.description,
      difficulty: difficulty,
      constraints: problem.constraints,
      allowedLanguages: problem.allowedLanguages,
      tags: problem.tags,
    };
    room.status = 'active';
    room.challengeEndsAt = challengeEndsAt;

    challengeNamespace.to(roomId).emit('room-state', room);
  });

  // Score updates from clients after running tests
  socket.on('score-update', ({ roomId, playerId, passed, total, percentage }) => {
    if (!roomId || !playerId) return;
    const room = challengeRooms.get(roomId);
    if (!room) return;

    room.scores = room.scores || {};
    room.scores[playerId] = {
      passed: Number(passed) || 0,
      total: Number(total) || 0,
      percentage: Number(percentage) || 0,
      lastUpdated: new Date().toISOString(),
    };

    // Check for immediate winner: fully solved
    const playerScore = room.scores[playerId];
    const everyone = Object.values(room.scores || {});
    let winnerId = null;
    if (playerScore && playerScore.total > 0 && playerScore.passed === playerScore.total) {
      winnerId = playerId;
    } else if (everyone.length >= 2) {
      // Decide winner if challenge already ended (client may call end). We keep basic comparison.
      const entries = Object.entries(room.scores);
      const [aId, a] = entries[0];
      const [bId, b] = entries[1];
      if ((a.passed > b.passed) || (a.passed === b.passed && a.percentage > b.percentage)) winnerId = aId;
      else if ((b.passed > a.passed) || (a.passed === b.passed && b.percentage > a.percentage)) winnerId = bId;
    }

    if (winnerId && room.status !== 'ended') {
      room.status = 'ended';
      room.endedAt = new Date().toISOString();
      room.winnerId = winnerId;
      room.reward = computeReward(room.selectedProblem?.difficulty || 'Medium');
      challengeNamespace.to(roomId).emit('end-challenge', room);
    } else {
      // Otherwise broadcast score/state update
      challengeNamespace.to(roomId).emit('room-state', room);
    }
  });

  // Client requests the latest state explicitly
  socket.on('request-state', ({ roomId }) => {
    if (!roomId) return;
    const room = challengeRooms.get(roomId);
    if (room) challengeNamespace.to(roomId).emit('room-state', room);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = challengeRooms.get(roomId);
    if (!room) return;
    // We don't know which user disconnected reliably; clients should also announce leaves.
    // If room becomes empty, prune.
    setTimeout(() => pruneEmptyRoom(roomId), 30000);
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