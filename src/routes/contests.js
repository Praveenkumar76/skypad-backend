const express = require('express');
const Contest = require('../models/Contest');
const ContestRegistration = require('../models/ContestRegistration');
const ContestSubmission = require('../models/ContestSubmission');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');
const { broadcastLeaderboardUpdate } = require('../socketServer');

const router = express.Router();

// Check database connection
const checkDB = (res) => {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ message: 'Database not available. Please try again later.' });
    return false;
  }
  return true;
};

// CREATE CONTEST (Admin/Creator only)
router.post('/create', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { title, description, startTime, endTime, visibility, problems, allowedLanguages, maxParticipants } = req.body;

    if (!title || !description || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, description, start time, and end time are required' });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    if (!problems || problems.length === 0) {
      return res.status(400).json({ message: 'At least one problem is required' });
    }

    // Generate unique contest ID and shareable link
    let contestId;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
      contestId = Contest.generateContestId();
      const existing = await Contest.findOne({ contestId });
      if (!existing) exists = false;
      attempts++;
    }

    if (exists) {
      return res.status(500).json({ message: 'Failed to generate unique contest ID' });
    }

    const shareableLink = `/contest/${contestId}`;

    // Validate problems exist
    for (const prob of problems) {
      const problem = await Problem.findOne({ id: prob.problemId });
      if (!problem) {
        return res.status(404).json({ message: `Problem ${prob.problemId} not found` });
      }
    }

    const contest = await Contest.create({
      contestId,
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      visibility: visibility || 'public',
      shareableLink,
      creatorId: req.user.sub,
      problems: problems.map((p, index) => ({
        problemId: p.problemId,
        points: p.points || 10,
        order: index + 1
      })),
      allowedLanguages: allowedLanguages || ['javascript', 'python', 'cpp', 'java'],
      maxParticipants,
      status: 'scheduled'
    });

    return res.status(201).json({
      contestId: contest.contestId,
      title: contest.title,
      shareableLink: contest.shareableLink,
      startTime: contest.startTime,
      endTime: contest.endTime,
      visibility: contest.visibility
    });
  } catch (err) {
    console.error('Create contest error:', err);
    return res.status(500).json({ message: 'Failed to create contest', error: err.message });
  }
});

// GET ALL CONTESTS (Public contests list)
router.get('/list', async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { status, visibility } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    } else {
      // By default, don't show drafts
      query.status = { $ne: 'draft' };
    }

    if (visibility) {
      query.visibility = visibility;
    } else {
      // By default, only show public contests
      query.visibility = 'public';
    }

    const contests = await Contest.find(query)
      .populate('creatorId', 'username fullName')
      .sort({ startTime: -1 })
      .limit(50);

    // Add state to each contest
    const contestsWithState = contests.map(contest => ({
      ...contest.toObject(),
      state: contest.getState()
    }));

    return res.json({ contests: contestsWithState });
  } catch (err) {
    console.error('List contests error:', err);
    return res.status(500).json({ message: 'Failed to fetch contests', error: err.message });
  }
});

// GET CONTEST BY ID
router.get('/:contestId', async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;

    const contest = await Contest.findOne({ contestId })
      .populate('creatorId', 'username fullName');

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Fetch problem details
    const problemDetails = await Promise.all(
      contest.problems.map(async (cp) => {
        const problem = await Problem.findOne({ id: cp.problemId });
        return {
          problemId: cp.problemId,
          points: cp.points,
          order: cp.order,
          title: problem?.title || 'Unknown',
          difficulty: problem?.difficulty || 'Medium'
        };
      })
    );

    return res.json({
      ...contest.toObject(),
      problems: problemDetails,
      state: contest.getState()
    });
  } catch (err) {
    console.error('Get contest error:', err);
    return res.status(500).json({ message: 'Failed to fetch contest', error: err.message });
  }
});

// REGISTER FOR CONTEST
router.post('/:contestId/register', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;
    const userId = req.user.sub;

    const contest = await Contest.findOne({ contestId });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest has ended
    if (contest.hasEnded()) {
      return res.status(400).json({ message: 'Contest has already ended' });
    }

    // Check if already registered
    const existing = await ContestRegistration.findOne({ contestId, userId });
    if (existing) {
      return res.status(400).json({ message: 'Already registered for this contest' });
    }

    // Check max participants
    if (contest.maxParticipants && contest.stats.totalParticipants >= contest.maxParticipants) {
      return res.status(400).json({ message: 'Contest is full' });
    }

    const registration = await ContestRegistration.create({
      contestId,
      userId,
      registrationTime: new Date()
    });

    // Update contest stats
    contest.stats.totalParticipants += 1;
    await contest.save();

    return res.status(201).json({
      message: 'Successfully registered',
      registration: {
        contestId: registration.contestId,
        registrationTime: registration.registrationTime
      }
    });
  } catch (err) {
    console.error('Register contest error:', err);
    return res.status(500).json({ message: 'Failed to register', error: err.message });
  }
});

// GET USER'S CONTEST REGISTRATION STATUS
router.get('/:contestId/registration', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;
    const userId = req.user.sub;

    const registration = await ContestRegistration.findOne({ contestId, userId });

    if (!registration) {
      return res.json({ registered: false });
    }

    return res.json({
      registered: true,
      score: registration.score,
      problemsSolved: registration.problemsSolved.length,
      submissionsCount: registration.submissionsCount,
      rank: registration.rank
    });
  } catch (err) {
    console.error('Get registration error:', err);
    return res.status(500).json({ message: 'Failed to fetch registration', error: err.message });
  }
});

// GET CONTEST LEADERBOARD
router.get('/:contestId/leaderboard', async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;

    const registrations = await ContestRegistration.find({ contestId })
      .populate('userId', 'username fullName')
      .sort({ score: -1, lastSubmissionTime: 1 })
      .limit(100);

    const leaderboard = registrations.map((reg, index) => ({
      rank: index + 1,
      username: reg.userId?.username || 'Unknown',
      fullName: reg.userId?.fullName || 'Unknown',
      score: reg.score,
      problemsSolved: reg.problemsSolved.length,
      submissionsCount: reg.submissionsCount,
      lastSubmissionTime: reg.lastSubmissionTime
    }));

    return res.json({ leaderboard });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    return res.status(500).json({ message: 'Failed to fetch leaderboard', error: err.message });
  }
});

// SUBMIT SOLUTION IN CONTEST
router.post('/:contestId/submit', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;
    const { problemId, code, language } = req.body;
    const userId = req.user.sub;

    if (!problemId || !code || !language) {
      return res.status(400).json({ message: 'Problem ID, code, and language are required' });
    }

    const contest = await Contest.findOne({ contestId });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest is active
    if (!contest.isActive()) {
      return res.status(400).json({ message: 'Contest is not active' });
    }

    // Check if user is registered
    const registration = await ContestRegistration.findOne({ contestId, userId });
    if (!registration) {
      return res.status(403).json({ message: 'You must register for the contest first' });
    }

    // Check if problem is part of contest
    const contestProblem = contest.problems.find(p => p.problemId === problemId);
    if (!contestProblem) {
      return res.status(404).json({ message: 'Problem not found in this contest' });
    }

    // Check if already solved
    const alreadySolved = registration.problemsSolved.some(p => p.problemId === problemId);

    // Get problem details and test cases
    const problem = await Problem.findOne({ id: problemId });
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Execute code (using mock execution for now)
    const testResults = await executeCode(code, language, problem.testCases || []);
    const allPassed = testResults.every(result => result.passed);
    const status = allPassed ? 'accepted' : 'wrong_answer';

    // Calculate time taken from contest start
    const timeTaken = Math.floor((Date.now() - new Date(contest.startTime).getTime()) / 1000);

    // Create submission
    const submission = await ContestSubmission.create({
      contestId,
      problemId,
      userId,
      code,
      language,
      status,
      testResults,
      points: allPassed && !alreadySolved ? contestProblem.points : 0,
      timestamp: new Date(),
      timeTaken
    });

    // Update registration if accepted and not already solved
    if (allPassed && !alreadySolved) {
      registration.score += contestProblem.points;
      registration.problemsSolved.push({
        problemId,
        solvedAt: new Date(),
        points: contestProblem.points
      });
      registration.lastSubmissionTime = new Date();
      registration.submissionsCount += 1;
      await registration.save();

      // Update contest stats
      contest.stats.problemsSolved += 1;
      contest.stats.totalSubmissions += 1;
      await contest.save();
    } else {
      registration.submissionsCount += 1;
      registration.lastSubmissionTime = new Date();
      await registration.save();

      contest.stats.totalSubmissions += 1;
      await contest.save();
    }

    // Broadcast leaderboard update if score changed
    if (allPassed && !alreadySolved) {
      await broadcastLeaderboardUpdate(contestId);
    }

    return res.json({
      submissionId: submission._id,
      status: submission.status,
      points: submission.points,
      testResults: submission.testResults,
      score: registration.score,
      alreadySolved
    });
  } catch (err) {
    console.error('Submit contest solution error:', err);
    return res.status(500).json({ message: 'Failed to submit solution', error: err.message });
  }
});

// GET USER'S SUBMISSIONS FOR CONTEST
router.get('/:contestId/my-submissions', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;
    const userId = req.user.sub;

    const submissions = await ContestSubmission.find({ contestId, userId })
      .sort({ timestamp: -1 })
      .limit(50);

    // Get problem titles
    const submissionsWithDetails = await Promise.all(
      submissions.map(async (sub) => {
        const problem = await Problem.findOne({ id: sub.problemId });
        return {
          submissionId: sub._id,
          problemId: sub.problemId,
          problemTitle: problem?.title || 'Unknown',
          language: sub.language,
          status: sub.status,
          points: sub.points,
          timestamp: sub.timestamp,
          timeTaken: sub.timeTaken
        };
      })
    );

    return res.json({ submissions: submissionsWithDetails });
  } catch (err) {
    console.error('Get submissions error:', err);
    return res.status(500).json({ message: 'Failed to fetch submissions', error: err.message });
  }
});

// GET CONTEST PROBLEM DETAILS
router.get('/:contestId/problems/:problemId', async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId, problemId } = req.params;

    const contest = await Contest.findOne({ contestId });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if problem is part of contest
    const contestProblem = contest.problems.find(p => p.problemId === problemId);
    if (!contestProblem) {
      return res.status(404).json({ message: 'Problem not found in this contest' });
    }

    // Get full problem details
    const problem = await Problem.findOne({ id: problemId });

    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    return res.json({
      problemId: problem.id,
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      examples: problem.examples,
      constraints: problem.constraints,
      points: contestProblem.points,
      // Don't send test cases (hidden)
    });
  } catch (err) {
    console.error('Get contest problem error:', err);
    return res.status(500).json({ message: 'Failed to fetch problem', error: err.message });
  }
});

// Helper function for code execution (mock)
async function executeCode(code, language, testCases) {
  console.log(`Executing ${language} code against ${testCases.length} test cases`);
  
  // Mock: Return all passed for now
  return testCases.map((testCase, index) => ({
    testCaseIndex: index,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    actualOutput: testCase.expectedOutput,
    passed: true,
    executionTime: Math.random() * 100
  }));
}

module.exports = router;

