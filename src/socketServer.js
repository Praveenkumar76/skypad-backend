import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import ContestRegistration from "./models/ContestRegistration.js";
import Problem from "./models/Problem.js";
import ChallengeRoom from "./models/ChallengeRoom.js";
import { checkAndDetermineWinner } from "./routes/challenges.js";

let io;
const roomTimers = new Map(); // Store room timers

function initializeSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    console.log('Socket auth attempt with token:', token ? 'Present' : 'Missing');
    
    if (!token) {
      console.log('Socket auth failed: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.sub;
      socket.userEmail = decoded.email;
      socket.username = decoded.username || 'Unknown User';
      console.log('Socket auth success for user:', socket.username);
      next();
    } catch (err) {
      console.log('Socket auth failed:', err.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Join a contest room for leaderboard updates
    socket.on('join-contest', (data) => {
      const { contestId } = data;
      if (contestId) {
        socket.join(`contest-${contestId}`);
        socket.currentContestId = contestId;
        console.log(`${socket.username} joined contest ${contestId}`);
      }
    });

    // Leave contest room
    socket.on('leave-contest', () => {
      if (socket.currentContestId) {
        socket.leave(`contest-${socket.currentContestId}`);
        console.log(`${socket.username} left contest ${socket.currentContestId}`);
        socket.currentContestId = null;
      }
    });

    // Join a challenge room
    socket.on('join-room', async (data) => {
      try {
        const { roomId } = data;
        
        if (!roomId) {
          socket.emit('error', { message: 'Room ID is required' });
          return;
        }

        const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() })
          .populate('hostUserId', 'username fullName')
          .populate('opponentUserId', 'username fullName')
          .populate('winnerId', 'username fullName');
        
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is a participant
        const isHost = room.hostUserId.toString() === socket.userId;
        let isOpponent = room.opponentUserId && room.opponentUserId.toString() === socket.userId;
        
        // Allow joining based on room status
        if (!isHost && !isOpponent) {
          if (room.status === 'waiting' && !room.opponentUserId) {
            // If room is waiting and has no opponent, allow user to join as opponent
            console.log(`${socket.username} joining room ${roomId} as opponent`);
            room.opponentUserId = socket.userId;
            room.status = 'starting';
            await room.save();
            // Mark this user as the opponent for this session
            isOpponent = true;
          } else if (room.status === 'starting' || room.status === 'in_progress') {
            // Allow spectating for ongoing matches (but don't mark as participant)
            console.log(`${socket.username} spectating room ${roomId}`);
            // Don't return error, just let them observe
          } else if (room.status === 'finished' || room.status === 'expired') {
            // Allow viewing finished matches
            console.log(`${socket.username} viewing finished room ${roomId}`);
          } else {
            socket.emit('error', { message: 'You are not a participant in this room' });
            return;
          }
        }

        // Join the socket room
        socket.join(roomId.toUpperCase());
        socket.currentRoomId = roomId.toUpperCase();

        console.log(`${socket.username} joined room ${roomId.toUpperCase()}`);

        // Notify about current room state with full room data
        socket.emit('room-joined', {
          roomId: room.roomId,
          status: room.status,
          isHost,
          lobbyExpiresAt: room.lobbyExpiresAt,
          host: room.hostUserId,
          opponent: room.opponentUserId,
          winner: room.winnerId,
          startedAt: room.startedAt,
          finishedAt: room.finishedAt,
          matchDuration: room.matchDuration,
          hostReady: room.hostReady,
          opponentReady: room.opponentReady
        });

        // If opponent just joined and room becomes full, transition to starting state
        if (room.status === 'waiting' && room.isFull()) {
          // Clear the lobby timer
          clearLobbyTimer(roomId.toUpperCase());
          
          // Update room status to starting
          room.status = 'starting';
          await room.save();

          // Notify both users that opponent joined and they can start
          io.to(roomId.toUpperCase()).emit('opponent-joined', {
            status: 'starting',
            canStart: true
          });
        }
      } catch (err) {
        console.error('Join room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave room
    socket.on('leave-room', () => {
      if (socket.currentRoomId) {
        socket.leave(socket.currentRoomId);
        console.log(`${socket.username} left room ${socket.currentRoomId}`);
        socket.currentRoomId = null;
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);
      if (socket.currentRoomId) {
        socket.leave(socket.currentRoomId);
      }
    });

    // Handle player ready status updates
    socket.on('player-ready', async (data) => {
      const { roomId, ready } = data;
      if (roomId && socket.currentRoomId === roomId.toUpperCase()) {
        // Notify opponent about readiness change
        socket.to(socket.currentRoomId).emit('opponent-ready-changed', {
          username: socket.username,
          ready: ready
        });
      }
    });

    // Code submission result (emitted from server after evaluation)
    socket.on('code-submitted', async (data) => {
      const { roomId } = data;
      if (roomId && socket.currentRoomId === roomId.toUpperCase()) {
        // Notify opponent that code was submitted
        socket.to(socket.currentRoomId).emit('opponent-submitted', {
          username: socket.username
        });
      }
    });
  });

  // Start match timeout checker
  startMatchTimeoutChecker();

  return io;
}

// Start 3-second countdown and then start match
async function startMatchCountdown(room) {
  const roomId = room.roomId;

  // Emit countdown events
  for (let i = 3; i > 0; i--) {
    io.to(roomId).emit('match-countdown', { countdown: i });
    await sleep(1000);
  }

  // Update room status to in_progress
  room.status = 'in_progress';
  room.startedAt = new Date();
  await room.save();

  // Notify both users to redirect to IDE
  io.to(roomId).emit('match-started', {
    roomId: room.roomId,
    problemId: room.problemId,
    startedAt: room.startedAt
  });

  console.log(`Match started for room ${roomId}`);
}

// Start match when both players are ready
async function startMatchFromReady(room) {
  if (!room.areBothReady()) {
    console.log(`Cannot start match for room ${room.roomId} - not all players ready`);
    return;
  }

  console.log(`Both players ready for room ${room.roomId}, starting countdown...`);
  await startMatchCountdown(room);
}

// Set up lobby expiry timer
function setLobbyTimer(roomId, expiryTime) {
  const timeUntilExpiry = expiryTime - Date.now();
  
  if (timeUntilExpiry <= 0) {
    expireRoom(roomId);
    return;
  }

  const timer = setTimeout(async () => {
    await expireRoom(roomId);
  }, timeUntilExpiry);

  roomTimers.set(roomId, timer);
  console.log(`Lobby timer set for room ${roomId} (expires in ${Math.floor(timeUntilExpiry / 1000)}s)`);
}

// Clear lobby timer
function clearLobbyTimer(roomId) {
  const timer = roomTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomId);
    console.log(`Lobby timer cleared for room ${roomId}`);
  }
}

// Expire a room
async function expireRoom(roomId) {
  try {
    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() });
    
    if (!room) {
      return;
    }

    if (room.status === 'waiting') {
      room.status = 'expired';
      await room.save();

      // Notify host that room expired
      io.to(roomId.toUpperCase()).emit('room-expired', {
        message: 'Room expired. Please create a new one.'
      });

      console.log(`Room ${roomId} expired`);
    }

    clearLobbyTimer(roomId);
  } catch (err) {
    console.error('Expire room error:', err);
  }
}

// Notify match finished
async function notifyMatchFinished(roomId, winnerId, winType = 'full') {
  try {
    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() })
      .populate('hostUserId', 'username fullName')
      .populate('opponentUserId', 'username fullName')
      .populate('winnerId', 'username fullName');

    if (!room || !io) {
      return;
    }

    let loserId = null;
    if (winnerId) {
      loserId = room.hostUserId._id.toString() === winnerId.toString() 
        ? room.opponentUserId._id.toString() 
        : room.hostUserId._id.toString();
    }

    // Notify both users
    io.to(roomId.toUpperCase()).emit('match-finished', {
      winnerId: winnerId ? winnerId.toString() : null,
      loserId,
      winner: room.winnerId,
      matchDuration: room.matchDuration,
      finishedAt: room.finishedAt,
      winType,
      isTie: !winnerId
    });

    const winnerName = winnerId && room.winnerId ? room.winnerId.username : 'TIE';
    console.log(`Match finished for room ${roomId}, winner: ${winnerName} (${winType})`);
  } catch (err) {
    console.error('Notify match finished error:', err);
  }
}

// Helper function for sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start periodic check for expired matches
function startMatchTimeoutChecker() {
  setInterval(async () => {
    try {
      
      // Find matches that are in progress and might be expired
      const inProgressRooms = await ChallengeRoom.find({ 
        status: 'in_progress',
        startedAt: { $exists: true }
      });
      
      for (const room of inProgressRooms) {
        const currentDuration = Math.floor((new Date() - room.startedAt) / 1000);
        
        // Get problem to determine time limit
        let problemData;
        if (mongoose.Types.ObjectId.isValid(room.problemId)) {
          problemData = await Problem.findById(room.problemId);
        }
        if (!problemData) {
          problemData = await Problem.findOne({ problemId: room.problemId });
        }
        
        if (problemData) {
          
          await checkAndDetermineWinner(room, problemData);
        }
      }
    } catch (error) {
      console.error('Error in match timeout checker:', error);
    }
  }, 30000); // Check every 30 seconds
}

// Broadcast leaderboard update to contest participants
async function broadcastLeaderboardUpdate(contestId) {
  if (!io) {
    return;
  }

  try {
      const registrations = await ContestRegistration.find({ contestId })
      .populate('userId', 'username fullName')
      .sort({ score: -1, lastSubmissionTime: 1 })
      .limit(100);

    const leaderboard = registrations.map((reg, index) => ({
      rank: index + 1,
      username: reg.userId?.username || 'Unknown',
      score: reg.score,
      problemsSolved: reg.problemsSolved.length
    }));

    io.to(`contest-${contestId}`).emit('leaderboard-update', { leaderboard });
    console.log(`Leaderboard update broadcast for contest ${contestId}`);
  } catch (err) {
    console.error('Broadcast leaderboard error:', err);
  }
}

// Get IO instance
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

export {
  initializeSocketServer,
  setLobbyTimer,
  clearLobbyTimer,
  notifyMatchFinished,
  broadcastLeaderboardUpdate,
  startMatchFromReady,
  getIO
};