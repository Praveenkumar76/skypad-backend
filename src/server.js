import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import { exec, spawn } from "child_process";
import { promises as fs } from 'fs';
import os from "os";
import dotenv from "dotenv";
import passport from "passport";
import { connectToDatabase } from "./db/mongoose.js";
import { initializeSocketServer } from "./socketServer.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import problemsRouter from "./routes/problem.js";
import challengesRouter, { checkAndDetermineWinner } from "./routes/challenges.js";
import contestsRouter from "./routes/contests.js";
import rewardsRouter from "./routes/rewards.js";
import { configurePassport } from "./config/passport.js";
dotenv.config();
// Initialize Passport
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
configurePassport();
// Initialize Passport middleware
app.use(passport.initialize());
// Note: We don't use passport.session() because we're using JWT tokens instead of sessions

// Routers
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

const PORT = process.env.PORT || 8080;

// Initialize Socket.io for main server
initializeSocketServer(httpServer);

// Initialize Code Editor Socket.io
const codeEditorIO = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/code-editor-socket'
});

// Store current code state
let currentState = {
  code: "// Start coding here...",
  language: "javascript"
};

// Basic in-memory room registry (ephemeral)
const rooms = new Map(); // roomId -> { players: Map<socketId, player>, lastUpdate: number }

// Store active processes for each socket
const activeProcesses = new Map();

// Language configurations
const languageConfigs = {
  javascript: { extension: '.js', command: 'node' },
  python: { extension: '.py', command: 'python' },
  cpp: { extension: '.cpp', command: 'g++' },
  java: { extension: '.java', command: 'javac' },
  c: { extension: '.c', command: 'gcc' }
};

// Function to create a temporary file
async function createTempFile(code, extension) {
  const fileName = `temp_${Date.now()}${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);
  await fs.writeFile(filePath, code);
  return filePath;
}

// Function to delete temporary file
async function deleteTempFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error deleting temp file:', error);
  }
}

// Function to execute code interactively using streams
async function executeCodeInteractive(code, language, socket) {
  let filePath;
  let child;
  
  try {
    switch (language) {
      case 'python':
        filePath = await createTempFile(code, '.py');
        child = spawn('python', ['-u', filePath]); // -u for unbuffered output
        
        // Store process so we can send input to it later
        activeProcesses.set(socket.id, { child, filePath });
        
        // Stream stdout to client in real-time
        child.stdout.on('data', (data) => {
          socket.emit('code-output', { data: data.toString(), stream: 'stdout' });
        });
        
        // Stream stderr to client
        child.stderr.on('data', (data) => {
          socket.emit('code-output', { data: data.toString(), stream: 'stderr' });
        });
        
        // Handle process completion
        child.on('close', (code) => {
          deleteTempFile(filePath);
          activeProcesses.delete(socket.id);
          socket.emit('code-finished', { 
            exitCode: code,
            success: code === 0 
          });
        });
        
        // Handle errors
        child.on('error', (error) => {
          deleteTempFile(filePath);
          activeProcesses.delete(socket.id);
          socket.emit('code-finished', { 
            success: false, 
            error: error.message 
          });
        });
        
        return { started: true };

      case 'javascript':
        // For JavaScript, still use synchronous execution
        return await executeCodeSync(code, language);

      case 'c':
      case 'cpp':
        filePath = await createTempFile(code, '.cpp');
        const executablePath = path.join(os.tmpdir(), `temp_program_${Date.now()}`);
        return new Promise((resolve) => {
          exec(`g++ ${filePath} -o ${executablePath} && ${executablePath}`, { timeout: 10000 }, (error, stdout, stderr) => {
            deleteTempFile(filePath);
            deleteTempFile(executablePath);
            if (error) {
              resolve({ success: false, output: stderr || error.message });
            } else {
              resolve({ success: true, output: stdout || 'Code executed successfully!' });
            }
          });
        });

      case 'java':
        // Java requires the filename to match the public class name
        // Save as Main.java to avoid compilation errors
        const className = 'Main';
        const javaDir = path.join(os.tmpdir(), 'temp');
        
        // Create temp directory if it doesn't exist
        try {
          await fs.mkdir(javaDir, { recursive: true });
        } catch (err) {
          // Directory might already exist
        }
        
        filePath = path.join(javaDir, 'Main.java');
        await fs.writeFile(filePath, code);
        
        return new Promise((resolve) => {
          // Compile and run Java code
          exec(`javac "${filePath}" && java -cp "${javaDir}" ${className}`, { timeout: 10000 }, async (error, stdout, stderr) => {
            // Clean up both .java and .class files
            try {
              await fs.unlink(filePath);
              await fs.unlink(path.join(javaDir, 'Main.class'));
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            
            if (error) {
              resolve({ success: false, output: stderr || error.message });
            } else {
              resolve({ success: true, output: stdout || 'Code executed successfully!' });
            }
          });
        });

      case 'c':
        filePath = await createTempFile(code, '.c');
        const cExecutablePath = path.join(os.tmpdir(), `temp_program_${Date.now()}`);
        return new Promise((resolve) => {
          exec(`gcc ${filePath} -o ${cExecutablePath} && ${cExecutablePath}`, { timeout: 10000 }, (error, stdout, stderr) => {
            deleteTempFile(filePath);
            deleteTempFile(cExecutablePath);
            if (error) {
              resolve({ success: false, output: stderr || error.message });
            } else {
              resolve({ success: true, output: stdout || 'Code executed successfully!' });
            }
          });
        });

      default:
        return await executeCodeSync(code, language);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Synchronous execution for languages that don't support interactive input
async function executeCodeSync(code, language) {
  let filePath;
  try {
    switch (language) {
      case 'javascript':
        return new Promise((resolve) => {
          try {
            let consoleOutput = [];
            const originalLog = console.log;
            
            console.log = (...args) => {
              consoleOutput.push(args.map(arg => String(arg)).join(' '));
              originalLog(...args);
            };
            
            try {
              const safeEval = new Function(code);
              const result = safeEval();
              console.log = originalLog;
              
              if (consoleOutput.length > 0) {
                resolve({ success: true, output: consoleOutput.join('\n') });
              } else if (result !== undefined) {
                resolve({ success: true, output: String(result) });
              } else {
                resolve({ success: true, output: 'Code executed successfully!' });
              }
            } catch (execError) {
              console.log = originalLog;
              throw execError;
            }
          } catch (error) {
            resolve({ success: false, output: error.message });
          }
        });
        
      default:
        return { success: false, output: 'Language not supported for sync execution' };
    }
  } catch (error) {
    return { success: false, output: error.message };
  }
}

// Code Editor Socket.IO connection handling
codeEditorIO.on('connection', (socket) => {
  console.log('A user connected to code editor');

  // Room joining for collaborative sessions (challenge rooms, etc.)
  socket.on('join-room', (payload) => {
    const roomId = typeof payload === 'string' ? payload : payload?.roomId;
    const player = typeof payload === 'object' ? payload?.player : null;
    if (!roomId) return;

    socket.join(roomId);

    // Maintain ephemeral room registry
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { players: new Map(), lastUpdate: Date.now() });
    }
    const room = rooms.get(roomId);
    if (player) {
      room.players.set(socket.id, player);
      room.lastUpdate = Date.now();
      // Notify everyone in the room (including the joining user) about the new player
      codeEditorIO.to(roomId).emit('player-joined', { roomId, player, socketId: socket.id, players: Array.from(room.players.values()) });
    } else {
      socket.to(roomId).emit('system', { type: 'join', id: socket.id });
    }
  });

  // Relay room-scoped events for challenge room coordination
  socket.on('room-state', ({ roomId, state }) => {
    if (!roomId || !state) return;
    codeEditorIO.to(roomId).emit('room-state', { roomId, state, ts: Date.now() });
  });

  socket.on('problem-selected', ({ roomId, problem }) => {
    if (!roomId || !problem) return;
    codeEditorIO.to(roomId).emit('problem-selected', { roomId, problem, ts: Date.now() });
  });

  socket.on('challenge-start', ({ roomId, startAt, duration, problem }) => {
    if (!roomId || !startAt || !duration) return;
    codeEditorIO.to(roomId).emit('challenge-start', { roomId, startAt, duration, problem: problem || null, ts: Date.now() });
  });

  socket.on('score-update', ({ roomId, playerId, score }) => {
    if (!roomId || !playerId || !score) return;
    codeEditorIO.to(roomId).emit('score-update', { roomId, playerId, score, ts: Date.now() });
  });

  socket.on('challenge-end', ({ roomId, winnerId, scores }) => {
    if (!roomId || !winnerId) return;
    codeEditorIO.to(roomId).emit('challenge-end', { roomId, winnerId, scores: scores || null, ts: Date.now() });
  });

  socket.on('timer-sync', ({ roomId, remaining }) => {
    if (!roomId || typeof remaining !== 'number') return;
    socket.to(roomId).emit('timer-sync', { roomId, remaining, ts: Date.now() });
  });

  socket.on('leave-room', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(socket.id);
      room.lastUpdate = Date.now();
      codeEditorIO.to(roomId).emit('player-left', { roomId, socketId: socket.id, players: Array.from(room.players.values()) });
    }
  });

  // Send current code state to newly connected users
  socket.emit('initial-code', currentState);

  // Handle code changes
  socket.on('code-change', ({ roomId, ...data }) => {
    currentState = data;
    if (roomId) {
      socket.to(roomId).emit('code-update', data);
    } else {
      socket.broadcast.emit('code-update', data);
    }
  });

  // Handle code execution
  socket.on('run-code', async (data) => {
    console.log(`Executing ${data.language} code...`);
    
    // Stop any previous process
    const prevProcess = activeProcesses.get(socket.id);
    if (prevProcess) {
      prevProcess.child.kill();
      await deleteTempFile(prevProcess.filePath);
      activeProcesses.delete(socket.id);
    }
    
    const result = await executeCodeInteractive(data.code, data.language, socket);
    
    // For non-interactive languages, send result directly
    if (result.output !== undefined) {
      socket.emit('run-result', result);
    }
  });
  
  // Handle user input during execution
  socket.on('send-input', (data) => {
    const process = activeProcesses.get(socket.id);
    if (process && process.child && process.child.stdin) {
      process.child.stdin.write(data.input + '\n');
    }
  });
  
  // Handle stopping execution
  socket.on('stop-execution', () => {
    const process = activeProcesses.get(socket.id);
    if (process) {
      process.child.kill();
      deleteTempFile(process.filePath);
      activeProcesses.delete(socket.id);
      socket.emit('code-finished', { success: false, stopped: true });
    }
  });

  // Chat messaging within a room
  socket.on('chat', ({ roomId, message, senderName }) => {
    if (!roomId || !message) return;
    codeEditorIO.to(roomId).emit('chat', { id: socket.id, message, senderName, ts: Date.now() });
  });

  // Handle language change
  socket.on('language-change', (data) => {
    currentState.language = data.language;
    socket.broadcast.emit('language-update', data);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('A user disconnected from code editor');
    
    // Clean up any rooms the socket was part of
    for (const [roomId, info] of rooms.entries()) {
      if (info.players.has(socket.id)) {
        info.players.delete(socket.id);
        info.lastUpdate = Date.now();
        codeEditorIO.to(roomId).emit('player-left', { roomId, socketId: socket.id, players: Array.from(info.players.values()) });
      }
    }
    
    // Clean up any running process
    const process = activeProcesses.get(socket.id);
    if (process) {
      process.child.kill();
      deleteTempFile(process.filePath);
      activeProcesses.delete(socket.id);
    }
  });
});

// Get supported languages endpoint
app.get('/languages', (req, res) => {
  res.json({
    languages: Object.keys(languageConfigs).map(lang => ({
      id: lang,
      name: lang.charAt(0).toUpperCase() + lang.slice(1),
      extension: languageConfigs[lang].extension
    }))
  });
});

connectToDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`\n✅ Backend listening on http://localhost:${PORT}`);
    console.log(`✅ WebSocket server ready`);
    console.log(`✅ Code Editor WebSocket server ready`);
    console.log(`📝 Supported languages: ${Object.keys(languageConfigs).join(', ')}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`🔌 Code Editor WebSocket endpoint: ws://localhost:${PORT}/code-editor-socket`);
  });
}).catch((error) => {
  console.warn('⚠️  Database connection failed, but starting server anyway:', error.message);
  httpServer.listen(PORT, () => {
    console.log(`\n✅ Backend listening on http://localhost:${PORT} (without database)`);
    console.log(`✅ WebSocket server ready`);
    console.log(`✅ Code Editor WebSocket server ready`);
    console.log(`📝 Supported languages: ${Object.keys(languageConfigs).join(', ')}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`🔌 Code Editor WebSocket endpoint: ws://localhost:${PORT}/code-editor-socket`);
  });
});