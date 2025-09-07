const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    username: { type: String, required: true },
    fullName: { type: String },
    passwordHash: { type: String, required: true },
    profilePictureUrl: { type: String },
    lastLoginAt: { type: Date },
    
    // User Statistics
    stats: {
      problemsSolved: { type: Number, default: 0 },
      totalSubmissions: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 }, // percentage
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      weeklyActivity: { type: Number, default: 0 },
      monthlyActivity: { type: Number, default: 0 },
      totalTimeSpent: { type: Number, default: 0 }, // in minutes
      favoriteTopic: { type: String, default: 'Arrays' },
      lastActive: { type: Date, default: Date.now },
      globalRank: { type: Number, default: 0 },
      rating: { type: Number, default: 1200 },
      maxRating: { type: Number, default: 1200 }
    },
    
    // Contest Statistics
    contestStats: {
      participated: { type: Number, default: 0 },
      won: { type: Number, default: 0 },
      averageRank: { type: Number, default: 0 },
      bestRank: { type: Number, default: 0 }
    },
    
    // Problem Solving Progress by Difficulty
    difficultyProgress: {
      easy: {
        solved: { type: Number, default: 0 },
        total: { type: Number, default: 100 },
        percentage: { type: Number, default: 0 }
      },
      medium: {
        solved: { type: Number, default: 0 },
        total: { type: Number, default: 150 },
        percentage: { type: Number, default: 0 }
      },
      hard: {
        solved: { type: Number, default: 0 },
        total: { type: Number, default: 80 },
        percentage: { type: Number, default: 0 }
      }
    },
    
    // Topic-wise Progress
    topicProgress: {
      Array: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      String: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Tree: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Graph: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      'Dynamic Programming': { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      'Linked List': { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Stack: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Queue: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Greedy: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } },
      Recursion: { solved: { type: Number, default: 0 }, total: { type: Number, default: 10 } }
    },
    
    // Solved Problems
    solvedProblems: [{
      problemId: { type: String, required: true },
      title: { type: String, required: true },
      difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
      topic: { type: String, required: true },
      solvedAt: { type: Date, default: Date.now },
      timeSpent: { type: Number, default: 0 }, // in minutes
      points: { type: Number, default: 0 }
    }],
    
    // Contest Participation
    contestHistory: [{
      contestId: { type: String, required: true },
      contestName: { type: String, required: true },
      rank: { type: Number, required: true },
      isWon: { type: Boolean, default: false },
      participatedAt: { type: Date, default: Date.now },
      points: { type: Number, default: 0 }
    }],
    
    // Daily Activity Streaks
    dailyStreaks: [{
      date: { type: String, required: true }, // YYYY-MM-DD format
      timestamp: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);


