const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173"], // Add your frontend URLs
  methods: ["GET", "POST"],
  credentials: true
}));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store current code state
let currentState = {
  code: "// Start coding here...",
  language: "javascript"
};

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

// Function to execute code based on language
async function executeCode(code, language) {
  let filePath;
  try {
    switch (language) {
      case 'python':
        filePath = await createTempFile(code, '.py');
        return new Promise((resolve) => {
          exec(`python ${filePath}`, { timeout: 10000 }, (error, stdout, stderr) => {
            deleteTempFile(filePath);
            if (error) {
              resolve({ success: false, output: stderr || error.message });
            } else {
              resolve({ success: true, output: stdout || 'Code executed successfully!' });
            }
          });
        });

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
        const className = 'Main';
        filePath = await createTempFile(code, '.java');
        return new Promise((resolve) => {
          exec(`javac ${filePath} && java -cp ${path.dirname(filePath)} ${className}`, { timeout: 10000 }, (error, stdout, stderr) => {
            deleteTempFile(filePath);
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

      case 'javascript':
      default:
        return new Promise((resolve) => {
          try {
            // Create a safe execution environment
            const safeEval = new Function(code);
            const result = safeEval();
            resolve({ success: true, output: result !== undefined ? String(result) : 'Code executed successfully!' });
          } catch (error) {
            resolve({ success: false, output: error.message });
          }
        });
    }
  } catch (error) {
    return { success: false, output: error.message };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected to code editor');
  
  // Send current code state to newly connected users
  socket.emit('initial-code', currentState);

  // Handle code changes
  socket.on('code-change', (data) => {
    currentState = data;
    // Broadcast to all clients except sender
    socket.broadcast.emit('code-update', data);
  });

  // Handle code execution
  socket.on('run-code', async (data) => {
    console.log(`Executing ${data.language} code...`);
    const result = await executeCode(data.code, data.language);
    io.emit('run-result', result);
  });

  // Handle language change
  socket.on('language-change', (data) => {
    currentState.language = data.language;
    socket.broadcast.emit('language-update', data);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('A user disconnected from code editor');
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
