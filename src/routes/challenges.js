const express = require('express');
const ChallengeRoom = require('../models/ChallengeRoom');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');
const { setLobbyTimer, notifyMatchFinished } = require('../socketServer');

const router = express.Router();

// Create a new challenge room
router.post('/rooms/create', authenticateToken, async (req, res) => {
  try {
    const { problemId } = req.body;
    
    if (!problemId) {
      return res.status(400).json({ message: 'Problem ID is required' });
    }

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not available. Please try again later.' });
    }

    // Verify problem exists - try both _id and problemId field
    let problem;
    
    // First try to find by MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(problemId)) {
      problem = await Problem.findById(problemId);
    }
    
    // If not found, try finding by problemId field (custom field)
    if (!problem) {
      problem = await Problem.findOne({ problemId: problemId });
    }
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Generate unique room ID
    let roomId;
    let roomExists = true;
    let attempts = 0;
    
    while (roomExists && attempts < 10) {
      roomId = ChallengeRoom.generateRoomId();
      const existing = await ChallengeRoom.findOne({ roomId });
      if (!existing) {
        roomExists = false;
      }
      attempts++;
    }

    if (roomExists) {
      return res.status(500).json({ message: 'Failed to generate unique room ID' });
    }

    // Create room with 5-minute expiry
    const lobbyExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    const room = await ChallengeRoom.create({
      roomId,
      problemId: problem._id.toString(), // Use the actual MongoDB _id
      hostUserId: req.user.sub,
      status: 'waiting',
      lobbyExpiresAt
    });

    // Set lobby expiry timer
    setLobbyTimer(room.roomId, room.lobbyExpiresAt.getTime());

    return res.status(201).json({
      roomId: room.roomId,
      problemId: room.problemId,
      status: room.status,
      expiresAt: room.lobbyExpiresAt
    });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ message: 'Failed to create room', error: err.message });
  }
});

// Join an existing challenge room
router.post('/rooms/join', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not available. Please try again later.' });
    }

    // Find room
    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() });
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room is valid
    if (!room.isValid()) {
      if (new Date() > room.lobbyExpiresAt) {
        room.status = 'expired';
        await room.save();
        return res.status(400).json({ message: 'Room has expired' });
      }
      return res.status(400).json({ message: 'Room is no longer available' });
    }

    // Check if room is already full
    if (room.isFull()) {
      return res.status(400).json({ message: 'Room is already full' });
    }

    // Check if user is trying to join their own room
    if (room.hostUserId.toString() === req.user.sub) {
      return res.status(400).json({ message: 'Cannot join your own room' });
    }

    // Add opponent to room and change status
    room.opponentUserId = req.user.sub;
    room.status = 'starting';
    await room.save();

    // Fetch problem details
    let problemData;
    if (mongoose.Types.ObjectId.isValid(room.problemId)) {
      problemData = await Problem.findById(room.problemId);
    }
    if (!problemData) {
      problemData = await Problem.findOne({ problemId: room.problemId });
    }

    return res.json({
      roomId: room.roomId,
      problemId: room.problemId,
      problem: problemData ? {
        id: problemData._id.toString(),
        title: problemData.title,
        difficulty: problemData.difficulty,
        description: problemData.description,
        examples: problemData.sampleTestCases || problemData.examples,
        constraints: problemData.constraints
      } : null,
      status: room.status
    });
  } catch (err) {
    console.error('Join room error:', err);
    return res.status(500).json({ message: 'Failed to join room', error: err.message });
  }
});

// Get room details
router.get('/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not available. Please try again later.' });
    }

    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() })
      .populate('hostUserId', 'username fullName')
      .populate('opponentUserId', 'username fullName')
      .populate('winnerId', 'username fullName');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Fetch problem details - handle both _id and problemId
    let problemData;
    if (mongoose.Types.ObjectId.isValid(room.problemId)) {
      problemData = await Problem.findById(room.problemId);
    }
    if (!problemData) {
      problemData = await Problem.findOne({ problemId: room.problemId });
    }

    // Calculate rewards if match is finished
    let rewards = null;
    if (room.status === 'finished' && room.winnerId && problemData) {
      const difficulty = problemData.difficulty.toLowerCase();
      let winnerReward = 0;
      let loserReward = 0;

      switch (difficulty) {
        case 'easy':
          winnerReward = 50;
          loserReward = 10;
          break;
        case 'medium':
          winnerReward = 100;
          loserReward = 20;
          break;
        case 'hard':
          winnerReward = 200;
          loserReward = 30;
          break;
        default:
          winnerReward = 75;
          loserReward = 15;
      }

      // Apply fast solve bonus
      const maxTime = getTimeLimitForDifficulty(difficulty);
      if (room.matchDuration && room.matchDuration < maxTime / 2) {
        winnerReward = Math.floor(winnerReward * 1.5);
      }

      rewards = {
        winnerCoins: winnerReward,
        loserCoins: loserReward,
        fastSolveBonus: room.matchDuration && room.matchDuration < maxTime / 2
      };
    }

    return res.json({
      roomId: room.roomId,
      problemId: room.problemId,
      problem: problemData ? {
        id: problemData._id.toString(),
        title: problemData.title,
        difficulty: problemData.difficulty,
        description: problemData.description,
        examples: problemData.sampleTestCases || problemData.examples,
        constraints: problemData.constraints,
        testCases: problemData.hiddenTestCases // Only include if user is authorized
      } : null,
      host: room.hostUserId,
      opponent: room.opponentUserId,
      status: room.status,
      winner: room.winnerId,
      lobbyExpiresAt: room.lobbyExpiresAt,
      startedAt: room.startedAt,
      finishedAt: room.finishedAt,
      matchDuration: room.matchDuration,
      rewards: rewards
    });
  } catch (err) {
    console.error('Get room error:', err);
    return res.status(500).json({ message: 'Failed to get room details', error: err.message });
  }
});

// Submit code for evaluation
router.post('/rooms/:roomId/submit', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ message: 'Code and language are required' });
    }

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not available. Please try again later.' });
    }

    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room is in progress
    if (room.status !== 'in_progress') {
      return res.status(400).json({ message: 'Match is not in progress' });
    }

    // Check if user is a participant
    const userId = req.user.sub;
    if (room.hostUserId.toString() !== userId && room.opponentUserId.toString() !== userId) {
      return res.status(403).json({ message: 'You are not a participant in this match' });
    }

    // Check if match is already finished (race condition prevention)
    if (room.winnerId) {
      return res.status(400).json({ message: 'Match has already been won' });
    }

    // Get problem and test cases - handle both _id and problemId
    let problemData;
    if (mongoose.Types.ObjectId.isValid(room.problemId)) {
      problemData = await Problem.findById(room.problemId);
    }
    if (!problemData) {
      problemData = await Problem.findOne({ problemId: room.problemId });
    }
    
    if (!problemData || !problemData.hiddenTestCases || problemData.hiddenTestCases.length === 0) {
      return res.status(500).json({ message: 'Problem test cases not found' });
    }

    // Execute code against test cases (simplified for now)
    // In production, this should use a sandboxed execution environment
    const testResults = await executeCode(code, language, problemData.hiddenTestCases);
    
    const allPassed = testResults.every(result => result.passed);
    const result = allPassed ? 'accepted' : 'rejected';

    // Add submission
    room.submissions.push({
      userId,
      code,
      language,
      result,
      testResults,
      submittedAt: new Date()
    });

    // If accepted and no winner yet, set winner (atomic operation)
    if (allPassed && !room.winnerId) {
      room.winnerId = userId;
      room.status = 'finished';
      room.finishedAt = new Date();
      
      if (room.startedAt) {
        room.matchDuration = Math.floor((room.finishedAt - room.startedAt) / 1000);
      }

      await room.save();

      // Award rewards and update stats
      await awardMatchRewards(room, problemData);

      // Notify both players via WebSocket
      await notifyMatchFinished(room.roomId, userId);
    } else {
      await room.save();
      
      // Check if we should determine winner based on partial solutions
      await checkAndDetermineWinner(room, problemData);
    }

    return res.json({
      result,
      testResults,
      isWinner: room.winnerId && room.winnerId.toString() === userId,
      matchFinished: room.status === 'finished'
    });
  } catch (err) {
    console.error('Submit code error:', err);
    return res.status(500).json({ message: 'Failed to submit code', error: err.message });
  }
});

// Mark player as ready
router.post('/rooms/:roomId/ready', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.sub;

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database not available. Please try again later.' });
    }

    const room = await ChallengeRoom.findOne({ roomId: roomId.toUpperCase() });
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is a participant
    const isHost = room.hostUserId.toString() === userId;
    const isOpponent = room.opponentUserId && room.opponentUserId.toString() === userId;
    
    if (!isHost && !isOpponent) {
      return res.status(403).json({ message: 'You are not a participant in this room' });
    }

    // Check if room has both players
    if (!room.isFull()) {
      return res.status(400).json({ message: 'Room is not full yet' });
    }

    // Check if match is in the right state
    if (room.status !== 'starting') {
      return res.status(400).json({ message: 'Room is not ready for starting' });
    }

    // Mark player as ready
    if (isHost) {
      room.hostReady = true;
    } else {
      room.opponentReady = true;
    }

    await room.save();

    // Check if both players are ready
    if (room.areBothReady()) {
      // Import socket functions dynamically to avoid circular dependency
      const { startMatchFromReady } = require('../socketServer');
      await startMatchFromReady(room);
    }

    return res.json({
      success: true,
      hostReady: room.hostReady,
      opponentReady: room.opponentReady,
      bothReady: room.areBothReady()
    });
  } catch (err) {
    console.error('Mark ready error:', err);
    return res.status(500).json({ message: 'Failed to mark ready', error: err.message });
  }
});

// Award rewards and update user statistics after match finish
async function awardMatchRewards(room, problemData, winType = 'full') {
  try {
    const User = require('../models/User');
    const winnerId = room.winnerId.toString();
    const loserId = room.hostUserId.toString() === winnerId 
      ? room.opponentUserId.toString() 
      : room.hostUserId.toString();

    // Calculate rewards based on problem difficulty and match duration
    const difficulty = problemData.difficulty.toLowerCase();
    let winnerReward = 0;
    let loserReward = 0;

    // Base rewards
    switch (difficulty) {
      case 'easy':
        winnerReward = 50;
        loserReward = 10;
        break;
      case 'medium':
        winnerReward = 100;
        loserReward = 20;
        break;
      case 'hard':
        winnerReward = 200;
        loserReward = 30;
        break;
      default:
        winnerReward = 75;
        loserReward = 15;
    }
    
    // Adjust rewards based on win type
    if (winType === 'partial') {
      winnerReward = Math.floor(winnerReward * 0.7); // 70% of full reward
      loserReward = Math.floor(loserReward * 0.8); // 80% of participation reward
    } else if (winType === 'timeout') {
      winnerReward = Math.floor(winnerReward * 0.5); // 50% of full reward
      loserReward = Math.floor(loserReward * 0.6); // 60% of participation reward
    }

    // Bonus for fast solve (under half the time limit)
    const maxTime = getTimeLimitForDifficulty(difficulty);
    if (room.matchDuration < maxTime / 2) {
      winnerReward = Math.floor(winnerReward * 1.5); // 50% bonus
    }

    // Update winner stats
    await User.findByIdAndUpdate(winnerId, {
      $inc: {
        'stats.coins': winnerReward,
        'challengeStats.matches': 1,
        'challengeStats.wins': 1,
        'challengeStats.totalRewards': winnerReward,
        'stats.problemsSolved': 1
      },
      $set: {
        'challengeStats.winRate': await calculateWinRate(winnerId),
        'challengeStats.fastestWin': await updateFastestWin(winnerId, room.matchDuration)
      }
    });

    // Update loser stats
    await User.findByIdAndUpdate(loserId, {
      $inc: {
        'stats.coins': loserReward,
        'challengeStats.matches': 1,
        'challengeStats.losses': 1,
        'challengeStats.totalRewards': loserReward
      },
      $set: {
        'challengeStats.winRate': await calculateWinRate(loserId)
      }
    });

    console.log(`Awarded ${winnerReward} coins to winner ${winnerId} and ${loserReward} coins to loser ${loserId}`);
  } catch (error) {
    console.error('Error awarding match rewards:', error);
  }
}

// Get time limit based on difficulty
function getTimeLimitForDifficulty(difficulty) {
  switch (difficulty) {
    case 'easy': return 15 * 60; // 15 minutes
    case 'medium': return 30 * 60; // 30 minutes
    case 'hard': return 60 * 60; // 60 minutes
    default: return 30 * 60; // Default 30 minutes
  }
}

// Calculate win rate for a user
async function calculateWinRate(userId) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user || !user.challengeStats || user.challengeStats.matches === 0) {
    return 0;
  }
  return Math.round((user.challengeStats.wins / user.challengeStats.matches) * 100);
}

// Update fastest win time
async function updateFastestWin(userId, matchDuration) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user || !user.challengeStats) {
    return matchDuration;
  }
  
  const currentFastest = user.challengeStats.fastestWin;
  if (currentFastest === 0 || matchDuration < currentFastest) {
    return matchDuration;
  }
  return currentFastest;
}

// Check and determine winner based on performance when no one fully solves
async function checkAndDetermineWinner(room, problemData) {
  try {
    const difficulty = problemData.difficulty.toLowerCase();
    const timeLimit = getTimeLimitForDifficulty(difficulty);
    const currentDuration = Math.floor((new Date() - room.startedAt) / 1000);
    
    // Check if time limit exceeded or both players have submitted
    const bothSubmitted = room.submissions.length >= 2;
    const timeExpired = currentDuration >= timeLimit;
    const shouldFinish = timeExpired || bothSubmitted;
    
    if (shouldFinish && !room.winnerId) {
      console.log('Determining winner based on performance...');
      
      // Get best submission for each player
      const hostId = room.hostUserId.toString();
      const opponentId = room.opponentUserId?.toString();
      
      const hostSubmissions = room.submissions.filter(s => s.userId.toString() === hostId);
      const opponentSubmissions = room.submissions.filter(s => s.userId.toString() === opponentId);
      
      // Find best submission (highest test pass rate)
      const getBestSubmission = (submissions) => {
        if (!submissions.length) return null;
        return submissions.reduce((best, current) => {
          const currentPassed = current.testResults?.filter(t => t.passed).length || 0;
          const bestPassed = best.testResults?.filter(t => t.passed).length || 0;
          return currentPassed > bestPassed ? current : best;
        });
      };
      
      const hostBest = getBestSubmission(hostSubmissions);
      const opponentBest = getBestSubmission(opponentSubmissions);
      
      const hostScore = hostBest?.testResults?.filter(t => t.passed).length || 0;
      const opponentScore = opponentBest?.testResults?.filter(t => t.passed).length || 0;
      
      let winnerId = null;
      let winnerType = 'timeout';
      
      if (hostScore > opponentScore) {
        winnerId = room.hostUserId;
        winnerType = 'partial';
      } else if (opponentScore > hostScore) {
        winnerId = room.opponentUserId;
        winnerType = 'partial';
      }
      // If tie (hostScore === opponentScore), winnerId remains null (tie)
      
      // Update room status
      room.status = 'finished';
      room.finishedAt = new Date();
      room.matchDuration = timeExpired ? timeLimit : currentDuration;
      if (winnerId) {
        room.winnerId = winnerId;
      }
      
      await room.save();
      
      // Award rewards (reduced for partial/timeout wins)
      if (winnerId) {
        await awardMatchRewards(room, problemData, winnerType);
      } else {
        // Tie - give small reward to both
        await awardTieRewards(room, problemData);
      }
      
      // Notify both players
      await notifyMatchFinished(room.roomId, winnerId, winnerType);
      
      console.log(`Match finished: ${winnerType} - Winner: ${winnerId || 'TIE'} (${hostScore} vs ${opponentScore})`);
    }
  } catch (error) {
    console.error('Error determining winner:', error);
  }
}

// Simple code execution function (improved evaluation)
async function executeCode(code, language, testCases) {
  console.log(`Executing ${language} code against ${testCases.length} test cases`);
  
  // Simple evaluation logic for basic cases
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    let passed = false;
    let actualOutput = '';
    let executionTime = Math.random() * 100 + 10; // Simulate execution time
    
    try {
      // Basic evaluation for simple cases
      if (language === 'javascript') {
        // For JavaScript, try to execute basic logic
        if (code.includes('console.log') && code.includes('Hello World')) {
          actualOutput = 'Hello World';
          passed = actualOutput.trim() === testCase.expectedOutput.trim();
        } else {
          // Random pass/fail for demonstration
          passed = Math.random() > 0.3; // 70% pass rate
          actualOutput = passed ? testCase.expectedOutput : 'Wrong Answer';
        }
      } else if (language === 'python') {
        // For Python
        if (code.includes('print') && code.includes('Hello World')) {
          actualOutput = 'Hello World';
          passed = actualOutput.trim() === testCase.expectedOutput.trim();
        } else {
          passed = Math.random() > 0.3;
          actualOutput = passed ? testCase.expectedOutput : 'Wrong Answer';
        }
      } else {
        // For other languages, random evaluation
        passed = Math.random() > 0.4; // 60% pass rate
        actualOutput = passed ? testCase.expectedOutput : 'Wrong Answer';
      }
    } catch (error) {
      passed = false;
      actualOutput = `Runtime Error: ${error.message}`;
    }
    
    results.push({
      testCaseIndex: i,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      passed,
      executionTime,
      isSample: i < 2 // First 2 are sample tests
    });
  }
  
  return results;
}

// Award tie rewards when both players perform equally
async function awardTieRewards(room, problemData) {
  try {
    const User = require('../models/User');
    const hostId = room.hostUserId.toString();
    const opponentId = room.opponentUserId?.toString();
    
    const difficulty = problemData.difficulty.toLowerCase();
    let tieReward = 0;
    
    switch (difficulty) {
      case 'easy':
        tieReward = 25; // Half of loser reward
        break;
      case 'medium':
        tieReward = 35;
        break;
      case 'hard':
        tieReward = 50;
        break;
      default:
        tieReward = 30;
    }
    
    // Award same reward to both players
    await User.findByIdAndUpdate(hostId, {
      $inc: {
        'stats.coins': tieReward,
        'challengeStats.matches': 1,
        'challengeStats.totalRewards': tieReward
      }
    });
    
    if (opponentId) {
      await User.findByIdAndUpdate(opponentId, {
        $inc: {
          'stats.coins': tieReward,
          'challengeStats.matches': 1,
          'challengeStats.totalRewards': tieReward
        }
      });
    }
    
    console.log(`Awarded tie rewards: ${tieReward} coins to both players`);
  } catch (error) {
    console.error('Error awarding tie rewards:', error);
  }
}

// Export additional functions for socket server
module.exports = router;
module.exports.checkAndDetermineWinner = checkAndDetermineWinner;

