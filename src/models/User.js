const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: { 
      type: String, 
      unique: true, 
      sparse: true // Allows null values for non-Google users while maintaining uniqueness
    },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    username: { type: String, required: true },
    fullName: { type: String },
    passwordHash: { type: String, required: false }, // Optional for OAuth users
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
      maxRating: { type: Number, default: 1200 },
      coins: { type: Number, default: 100 } // Starting coins for new users
    },
    
    // Contest Statistics
    contestStats: {
      participated: { type: Number, default: 0 },
      won: { type: Number, default: 0 },
      averageRank: { type: Number, default: 0 },
      bestRank: { type: Number, default: 0 }
    },
    
    // 1v1 Challenge Statistics
    challengeStats: {
      matches: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      winRate: { type: Number, default: 0 }, // percentage
      fastestWin: { type: Number, default: 0 }, // in seconds
      totalRewards: { type: Number, default: 0 } // total coins earned
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
      title: { type: String, required: false, default: 'Unknown' },
      difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: false, default: 'Medium' },
      topic: { type: String, required: false, default: 'General' },
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
    }],

    // Rewards System
    rewards: {
      coins: { type: Number, default: 0 },
      xp: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      badges: [{
        badgeId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary', 'mythic'], required: true },
        earnedAt: { type: Date, default: Date.now },
        category: { type: String, required: true }
      }],
      ownedItems: [{
        itemId: { type: String, required: true },
        itemType: { type: String, enum: ['theme', 'booster', 'cosmetic'], required: true },
        name: { type: String, required: true },
        purchasedAt: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: false }
      }],
      activeBoosters: [{
        boosterId: { type: String, required: true },
        type: { type: String, enum: ['xp', 'coins'], required: true },
        multiplier: { type: Number, required: true },
        expiresAt: { type: Date, required: true },
        activatedAt: { type: Date, default: Date.now }
      }],
      achievements: [{
        achievementId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        tier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], required: true },
        progress: { type: Number, default: 0 },
        target: { type: Number, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        reward: {
          coins: { type: Number, default: 0 },
          xp: { type: Number, default: 0 },
          badge: { type: String }
        }
      }],
      weeklyChallenges: [{
        challengeId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        target: { type: Number, required: true },
        progress: { type: Number, default: 0 },
        reward: { type: Number, required: true },
        weekStart: { type: Date, required: true },
        weekEnd: { type: Date, required: true },
        completed: { type: Boolean, default: false }
      }],
      monthlyChallenges: [{
        challengeId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        target: { type: Number, required: true },
        progress: { type: Number, default: 0 },
        reward: { type: Number, required: true },
        monthStart: { type: Date, required: true },
        monthEnd: { type: Date, required: true },
        completed: { type: Boolean, default: false }
      }],
      transactionHistory: [{
        type: { type: String, enum: ['earned', 'spent', 'reward'], required: true },
        amount: { type: Number, required: true },
        description: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        source: { type: String, required: true }
      }],
      dailyRewards: {
        lastClaimed: { type: Date },
        streak: { type: Number, default: 0 },
        nextReward: { type: Number, default: 1 }
      },
      profileCustomization: {
        frameStyle: { type: String, default: 'default' },
        theme: { type: String, default: 'default' },
        avatar: { type: String }
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);


