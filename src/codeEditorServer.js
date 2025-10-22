const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST"],
  credentials: true
}));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store current code state
let currentState = {
  code: "// Start coding here...",
  language: "javascript"
};

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
  const filePath = path.join(__dirname, fileName);
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
        const executablePath = path.join(__dirname, `temp_program_${Date.now()}`);
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
        const javaDir = path.join(__dirname, 'temp');
        
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
        const cExecutablePath = path.join(__dirname, `temp_program_${Date.now()}`);
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected to code editor');

  // Room joining for collaborative sessions
  socket.on('join-room', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.to(roomId).emit('system', { type: 'join', id: socket.id });
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
    io.to(roomId).emit('chat', { id: socket.id, message, senderName, ts: Date.now() });
  });

  // Handle language change
  socket.on('language-change', (data) => {
    currentState.language = data.language;
    socket.broadcast.emit('language-update', data);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('A user disconnected from code editor');
    
    // Clean up any running process
    const process = activeProcesses.get(socket.id);
    if (process) {
      process.child.kill();
      deleteTempFile(process.filePath);
      activeProcesses.delete(socket.id);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Code Editor Backend', timestamp: new Date().toISOString() });
});

// Get supported languages
app.get('/languages', (req, res) => {
  res.json({
    languages: Object.keys(languageConfigs).map(lang => ({
      id: lang,
      name: lang.charAt(0).toUpperCase() + lang.slice(1),
      extension: languageConfigs[lang].extension
    }))
  });
});

const PORT = process.env.CODE_EDITOR_PORT || 3002;

server.listen(PORT, () => {
  console.log(`🚀 Code Editor WebSocket server running on port ${PORT}`);
  console.log(`📝 Supported languages: ${Object.keys(languageConfigs).join(', ')}`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
});

module.exports = { server, io };
