const mongoose = require('mongoose');

const challengeRoomSchema = new mongoose.Schema(
  {
    roomId: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    problemId: { 
      type: String, 
      required: true 
    },
    hostUserId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    opponentUserId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    status: { 
      type: String, 
      enum: ['waiting', 'starting', 'in_progress', 'finished', 'expired'], 
      default: 'waiting' 
    },
    winnerId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    lobbyExpiresAt: { 
      type: Date, 
      required: true 
    },
    startedAt: { 
      type: Date 
    },
    finishedAt: { 
      type: Date 
    },
    // Submission tracking
    submissions: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      code: { type: String, required: true },
      language: { type: String, required: true },
      result: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
      submittedAt: { type: Date, default: Date.now },
      testResults: { type: Object }
    }],
    // Match metadata
    matchDuration: { 
      type: Number // in seconds
    },
    // Player readiness for starting match
    hostReady: { 
      type: Boolean, 
      default: false 
    },
    opponentReady: { 
      type: Boolean, 
      default: false 
    }
  },
  { timestamps: true }
);

// Index for querying active rooms
challengeRoomSchema.index({ status: 1, createdAt: -1 });

// Method to generate a unique room ID (format: ABC-123)
challengeRoomSchema.statics.generateRoomId = function() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let roomId = '';
  for (let i = 0; i < 3; i++) {
    roomId += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  roomId += '-';
  for (let i = 0; i < 3; i++) {
    roomId += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return roomId;
};

// Method to check if room is still valid
challengeRoomSchema.methods.isValid = function() {
  if (this.status === 'expired' || this.status === 'finished') {
    return false;
  }
  if (this.status === 'waiting' && new Date() > this.lobbyExpiresAt) {
    return false;
  }
  return true;
};

// Method to check if room is full
challengeRoomSchema.methods.isFull = function() {
  return this.hostUserId && this.opponentUserId;
};

// Method to check if both players are ready
challengeRoomSchema.methods.areBothReady = function() {
  return this.hostReady && this.opponentReady && this.isFull();
};

module.exports = mongoose.models.ChallengeRoom || mongoose.model('ChallengeRoom', challengeRoomSchema);

