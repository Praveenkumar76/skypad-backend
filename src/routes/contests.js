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

    const { 
      title, 
      description, 
      startTime, 
      endTime, 
      password,
      visibility, 
      questions, 
      timeSlots,
      allowedLanguages, 
      maxParticipants 
    } = req.body;

    if (!title || !description || !password) {
      return res.status(400).json({ message: 'Title, description, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({ message: 'At least one question is required' });
    }

    // Validate time slots if provided
    if (timeSlots && timeSlots.length > 0) {
      const selectedSlot = timeSlots.find(slot => slot.isSelected);
      if (!selectedSlot) {
        return res.status(400).json({ message: 'Please select a time slot for the contest' });
      }
      
      if (new Date(selectedSlot.startTime) >= new Date(selectedSlot.endTime)) {
        return res.status(400).json({ message: 'End time must be after start time' });
      }
    } else if (startTime && endTime) {
      if (new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ message: 'End time must be after start time' });
      }
    } else {
      return res.status(400).json({ message: 'Contest time must be specified either through time slots or start/end time' });
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

    // Process questions and generate unique IDs
    const processedQuestions = questions.map((question, index) => ({
      ...question,
      questionId: Contest.generateQuestionId(),
      order: index + 1,
      points: question.points || 100
    }));

    // Determine contest start and end times
    let contestStartTime, contestEndTime;
    if (timeSlots && timeSlots.length > 0) {
      const selectedSlot = timeSlots.find(slot => slot.isSelected);
      contestStartTime = new Date(selectedSlot.startTime);
      contestEndTime = new Date(selectedSlot.endTime);
    } else {
      contestStartTime = new Date(startTime);
      contestEndTime = new Date(endTime);
    }

    const contest = await Contest.create({
      contestId,
      title,
      description,
      startTime: contestStartTime,
      endTime: contestEndTime,
      password,
      visibility: visibility || 'public',
      shareableLink,
      creatorId: req.user.sub,
      questions: processedQuestions,
      timeSlots: timeSlots || [],
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
      visibility: contest.visibility,
      questionsCount: contest.questions.length,
      message: 'Contest created successfully'
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

// GET CONTEST SHARING INFO
router.get('/:contestId/share', async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;

    const contest = await Contest.findOne({ contestId })
      .populate('creatorId', 'username fullName');

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Return sharing information
    return res.json({
      contestId: contest.contestId,
      title: contest.title,
      description: contest.description,
      startTime: contest.startTime,
      endTime: contest.endTime,
      creator: contest.creatorId?.username || 'Unknown',
      questionsCount: contest.questions.length,
      maxParticipants: contest.maxParticipants,
      shareableLink: `${req.protocol}://${req.get('host')}/join-contest?id=${contest.contestId}`,
      joinInstructions: {
        step1: `Contest ID: ${contest.contestId}`,
        step2: 'Use the contest password provided by the organizer',
        step3: 'Go to /join-contest and enter the credentials'
      },
      state: contest.getState()
    });
  } catch (err) {
    console.error('Get contest sharing info error:', err);
    return res.status(500).json({ message: 'Failed to fetch contest info', error: err.message });
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

// JOIN CONTEST WITH PASSWORD
router.post('/join', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId, password } = req.body;
    const userId = req.user.sub;

    if (!contestId || !password) {
      return res.status(400).json({ message: 'Contest ID and password are required' });
    }

    const contest = await Contest.findOne({ contestId });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Verify password
    if (contest.password !== password) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Check if contest has ended
    if (contest.hasEnded()) {
      return res.status(400).json({ message: 'Contest has already ended' });
    }

    // Check if already registered
    const existing = await ContestRegistration.findOne({ contestId, userId });
    if (existing) {
      return res.status(200).json({ 
        message: 'Already joined this contest',
        contestInfo: {
          title: contest.title,
          description: contest.description,
          startTime: contest.startTime,
          endTime: contest.endTime,
          questionsCount: contest.questions.length
        }
      });
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
      message: 'Successfully joined contest',
      contestInfo: {
        title: contest.title,
        description: contest.description,
        startTime: contest.startTime,
        endTime: contest.endTime,
        questionsCount: contest.questions.length
      },
      registration: {
        contestId: registration.contestId,
        registrationTime: registration.registrationTime
      }
    });
  } catch (err) {
    console.error('Join contest error:', err);
    return res.status(500).json({ message: 'Failed to join contest', error: err.message });
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
    const { questionId, code, language } = req.body;
    const userId = req.user.sub;

    if (!questionId || !code || !language) {
      return res.status(400).json({ message: 'Question ID, code, and language are required' });
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

    // Check if question is part of contest
    const contestQuestion = contest.questions.find(q => q.questionId === questionId);
    if (!contestQuestion) {
      return res.status(404).json({ message: 'Question not found in this contest' });
    }

    // Check if already solved
    const alreadySolved = registration.problemsSolved.some(p => p.problemId === questionId);

    // Execute code using the contest question's test cases
    const testResults = await executeCode(code, language, contestQuestion.hiddenTestCases || []);
    const allPassed = testResults.every(result => result.passed);
    const status = allPassed ? 'accepted' : 'wrong_answer';

    // Calculate time taken from contest start
    const timeTaken = Math.floor((Date.now() - new Date(contest.startTime).getTime()) / 1000);

    // Create submission
    const submission = await ContestSubmission.create({
      contestId,
      problemId: questionId, // Using questionId in place of problemId for consistency
      userId,
      code,
      language,
      status,
      testResults,
      points: allPassed && !alreadySolved ? contestQuestion.points : 0,
      timestamp: new Date(),
      timeTaken
    });

    // Update registration if accepted and not already solved
    if (allPassed && !alreadySolved) {
      registration.score += contestQuestion.points;
      registration.problemsSolved.push({
        problemId: questionId, // Storing questionId as problemId for compatibility
        solvedAt: new Date(),
        points: contestQuestion.points
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

// GET CONTEST QUESTIONS FOR PARTICIPANTS
router.get('/:contestId/questions', authenticateToken, async (req, res) => {
  try {
    if (!checkDB(res)) return;

    const { contestId } = req.params;
    const userId = req.user.sub;

    const contest = await Contest.findOne({ contestId });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if user is registered
    const registration = await ContestRegistration.findOne({ contestId, userId });
    if (!registration) {
      return res.status(403).json({ message: 'You must join the contest first' });
    }

    // Return questions without hidden test cases
    const questionsForParticipant = contest.questions.map(q => ({
      questionId: q.questionId,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      constraints: q.constraints,
      sampleTestCases: q.sampleTestCases,
      timeLimit: q.timeLimit,
      memoryLimit: q.memoryLimit,
      points: q.points,
      order: q.order,
      tags: q.tags
    })).sort((a, b) => a.order - b.order);

    return res.json({
      questions: questionsForParticipant,
      contestInfo: {
        title: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
        allowedLanguages: contest.allowedLanguages,
        state: contest.getState()
      }
    });
  } catch (err) {
    console.error('Get contest questions error:', err);
    return res.status(500).json({ message: 'Failed to fetch questions', error: err.message });
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
    expectedOutput: testCase.output, // Using 'output' field from contest question format
    actualOutput: testCase.output, // Mock: same as expected for now
    passed: true,
    executionTime: Math.random() * 100
  }));
}

module.exports = router;

