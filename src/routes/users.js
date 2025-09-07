const express = require('express');
const User = require('../models/User');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile - Get current user's profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user profile data
    res.json({
      id: user._id,
      fullName: user.fullName || user.username,
      email: user.email,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// PUT /api/users/profile - Update current user's profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, email, username, profilePictureUrl } = req.body;
    
    console.log('Profile update request:', {
      userId: req.user.id,
      fullName,
      email,
      username,
      hasProfilePicture: !!profilePictureUrl,
      profilePictureLength: profilePictureUrl?.length
    });
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user fields
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (username) user.username = username;
    if (profilePictureUrl) user.profilePictureUrl = profilePictureUrl;
    
    user.updatedAt = new Date();
    await user.save();
    
    console.log('User updated successfully:', {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      hasProfilePicture: !!user.profilePictureUrl,
      profilePictureLength: user.profilePictureUrl?.length
    });

    res.json({
      id: user._id,
      fullName: user.fullName || user.username,
      email: user.email,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate real-time statistics
    const stats = await calculateUserStats(user);
    res.json(stats);
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// GET /api/users/recent-activity - Get recent activity
router.get('/recent-activity', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const recentActivity = await getRecentActivity(user);
    res.json(recentActivity);
  } catch (error) {
    console.error('Recent activity fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch recent activity' });
  }
});

// POST /api/users/solve-problem - Record problem solve
router.post('/solve-problem', authenticateToken, async (req, res) => {
  try {
    const { problemId, title, difficulty, topic, timeSpent, language } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already solved
    const alreadySolved = user.solvedProblems.some(p => p.problemId === problemId);
    if (alreadySolved) {
      return res.status(400).json({ message: 'Problem already solved' });
    }

    // Calculate points based on difficulty
    const points = getPointsForDifficulty(difficulty);
    
    // Add to solved problems
    user.solvedProblems.push({
      problemId,
      title,
      difficulty,
      topic,
      timeSpent: timeSpent || 0,
      points,
      language: language || 'JavaScript'
    });

    // Update statistics
    await updateUserStats(user);
    await user.save();

    res.json({ message: 'Problem solved successfully', points });
  } catch (error) {
    console.error('Problem solve error:', error);
    res.status(500).json({ message: 'Failed to record problem solve' });
  }
});

// POST /api/users/contest-participation - Record contest participation
router.post('/contest-participation', authenticateToken, async (req, res) => {
  try {
    const { contestId, contestName, rank, isWon } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate points based on rank
    const points = getContestPoints(rank, isWon);
    
    // Add to contest history
    user.contestHistory.push({
      contestId,
      contestName,
      rank,
      isWon: isWon || false,
      points
    });

    // Update contest statistics
    await updateContestStats(user);
    await user.save();

    res.json({ message: 'Contest participation recorded', points });
  } catch (error) {
    console.error('Contest participation error:', error);
    res.status(500).json({ message: 'Failed to record contest participation' });
  }
});

// Helper function to calculate user statistics
async function calculateUserStats(user) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Calculate weekly and monthly activity
  const weeklyActivity = user.solvedProblems.filter(p => p.solvedAt >= oneWeekAgo).length;
  const monthlyActivity = user.solvedProblems.filter(p => p.solvedAt >= oneMonthAgo).length;

  // Calculate difficulty progress
  const difficultyProgress = {
    easy: {
      solved: user.solvedProblems.filter(p => p.difficulty === 'Easy').length,
      total: 100,
      percentage: 0
    },
    medium: {
      solved: user.solvedProblems.filter(p => p.difficulty === 'Medium').length,
      total: 150,
      percentage: 0
    },
    hard: {
      solved: user.solvedProblems.filter(p => p.difficulty === 'Hard').length,
      total: 80,
      percentage: 0
    }
  };

  // Calculate percentages
  difficultyProgress.easy.percentage = Math.round((difficultyProgress.easy.solved / difficultyProgress.easy.total) * 100);
  difficultyProgress.medium.percentage = Math.round((difficultyProgress.medium.solved / difficultyProgress.medium.total) * 100);
  difficultyProgress.hard.percentage = Math.round((difficultyProgress.hard.solved / difficultyProgress.hard.total) * 100);

  // Calculate topic progress
  const topicProgress = {};
  const topics = ['Array', 'String', 'Tree', 'Graph', 'Dynamic Programming', 'Linked List', 'Stack', 'Queue', 'Greedy', 'Recursion'];
  topics.forEach(topic => {
    const solved = user.solvedProblems.filter(p => p.topic === topic).length;
    topicProgress[topic] = {
      solved,
      total: 10,
      percentage: Math.round((solved / 10) * 100)
    };
  });

  // Calculate favorite topic
  const topicCounts = {};
  user.solvedProblems.forEach(p => {
    topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
  });
  const favoriteTopic = Object.keys(topicCounts).reduce((a, b) => 
    topicCounts[a] > topicCounts[b] ? a : b, 'Arrays'
  );

  // Calculate streaks
  const currentStreak = calculateCurrentStreak(user.dailyStreaks);
  const longestStreak = calculateLongestStreak(user.dailyStreaks);

  // Calculate total time spent
  const totalTimeSpent = user.solvedProblems.reduce((total, p) => total + p.timeSpent, 0);

  // Calculate accuracy (simplified)
  const accuracy = user.solvedProblems.length > 0 ? 0.85 : 0;

  // Calculate rating
  const rating = calculateRating(user.solvedProblems, user.contestHistory);

  // Calculate global rank (simplified)
  const totalUsers = await User.countDocuments();
  const usersWithMoreProblems = await User.countDocuments({
    'stats.problemsSolved': { $gt: user.solvedProblems.length }
  });
  const globalRank = usersWithMoreProblems + 1;

  return {
    problemsSolved: user.solvedProblems.length,
    totalSubmissions: user.solvedProblems.length,
    accuracy,
    currentStreak,
    longestStreak,
    rank: globalRank,
    totalUsers,
    contestsParticipated: user.contestHistory.length,
    contestsWon: user.contestHistory.filter(c => c.isWon).length,
    averageRating: rating,
    maxRating: Math.max(rating, user.stats.maxRating),
    weeklyActivity,
    monthlyActivity,
    totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to hours
    favoriteTopic,
    lastActive: formatLastActive(user.stats.lastActive),
    difficultyStats: difficultyProgress,
    topicStats: topicProgress,
    winLossRatio: user.contestHistory.length > 0 ? 
      user.contestHistory.filter(c => c.isWon).length / user.contestHistory.length : 0
  };
}

// Helper function to get recent activity
async function getRecentActivity(user) {
  const recentActivity = [];

  // Add recent problems solved
  const recentProblems = user.solvedProblems
    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt))
    .slice(0, 3)
    .map(problem => ({
      type: 'problem',
      title: problem.title,
      difficulty: problem.difficulty,
      status: 'Solved',
      time: formatLastActive(problem.solvedAt),
      points: problem.points,
      topic: problem.topic
    }));

  // Add recent contests
  const recentContests = user.contestHistory
    .sort((a, b) => new Date(b.participatedAt) - new Date(a.participatedAt))
    .slice(0, 2)
    .map(contest => ({
      type: 'contest',
      title: contest.contestName,
      status: contest.isWon ? 'Won' : `Ranked ${contest.rank}`,
      time: formatLastActive(contest.participatedAt),
      points: contest.points
    }));

  // Add streak achievements
  const currentStreak = calculateCurrentStreak(user.dailyStreaks);
  if (currentStreak > 0) {
    recentActivity.push({
      type: 'streak',
      title: 'Daily Streak',
      status: `Day ${currentStreak}`,
      time: 'Today',
      points: currentStreak * 5
    });
  }

  return [...recentProblems, ...recentContests, ...recentActivity]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 6);
}

// Helper function to update user statistics
async function updateUserStats(user) {
  const stats = await calculateUserStats(user);
  
  user.stats = {
    problemsSolved: stats.problemsSolved,
    totalSubmissions: stats.totalSubmissions,
    accuracy: stats.accuracy,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    weeklyActivity: stats.weeklyActivity,
    monthlyActivity: stats.monthlyActivity,
    totalTimeSpent: stats.totalTimeSpent,
    favoriteTopic: stats.favoriteTopic,
    lastActive: new Date(),
    globalRank: stats.rank,
    rating: stats.averageRating,
    maxRating: stats.maxRating
  };

  user.difficultyProgress = stats.difficultyStats;
  user.topicProgress = stats.topicStats;
}

// Helper function to update contest statistics
async function updateContestStats(user) {
  const contests = user.contestHistory;
  
  user.contestStats = {
    participated: contests.length,
    won: contests.filter(c => c.isWon).length,
    averageRank: contests.length > 0 ? 
      Math.round(contests.reduce((sum, c) => sum + c.rank, 0) / contests.length) : 0,
    bestRank: contests.length > 0 ? Math.min(...contests.map(c => c.rank)) : 0
  };
}

// Helper functions
function calculateCurrentStreak(streaks) {
  if (streaks.length === 0) return 0;
  
  const sortedStreaks = streaks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  let currentStreak = 0;
  let currentDate = new Date();
  
  for (let i = 0; i < sortedStreaks.length; i++) {
    const streakDate = new Date(sortedStreaks[i].date);
    const daysDiff = Math.floor((currentDate - streakDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === currentStreak) {
      currentStreak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return currentStreak;
}

function calculateLongestStreak(streaks) {
  if (streaks.length === 0) return 0;
  
  const sortedStreaks = streaks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let longestStreak = 1;
  let currentStreak = 1;
  
  for (let i = 1; i < sortedStreaks.length; i++) {
    const prevDate = new Date(sortedStreaks[i - 1].date);
    const currDate = new Date(sortedStreaks[i].date);
    const daysDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  
  return longestStreak;
}

function calculateRating(problemsSolved, contestHistory) {
  let baseRating = 1200;
  
  // Add points for problems solved
  problemsSolved.forEach(problem => {
    const difficultyMultiplier = {
      'Easy': 10,
      'Medium': 25,
      'Hard': 50
    };
    baseRating += difficultyMultiplier[problem.difficulty] || 10;
  });
  
  // Add points for contest performance
  contestHistory.forEach(contest => {
    if (contest.isWon) {
      baseRating += 100;
    } else if (contest.rank <= 100) {
      baseRating += 50;
    } else if (contest.rank <= 500) {
      baseRating += 25;
    }
  });
  
  return Math.min(baseRating, 3000);
}

function formatLastActive(lastActive) {
  const now = new Date();
  const diffMs = now - new Date(lastActive);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return 'Over a week ago';
}

function getPointsForDifficulty(difficulty) {
  const points = {
    'Easy': 10,
    'Medium': 25,
    'Hard': 50
  };
  return points[difficulty] || 10;
}

function getContestPoints(rank, isWon) {
  if (isWon) return 100;
  if (rank <= 10) return 80;
  if (rank <= 50) return 60;
  if (rank <= 100) return 40;
  return 20;
}

module.exports = router;
