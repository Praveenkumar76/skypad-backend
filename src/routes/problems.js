const express = require('express');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/problems - Get all problems (public)
router.get('/', async (req, res) => {
  try {
    const { difficulty, search, page = 1, limit = 10 } = req.query;
    const query = { isActive: true };
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    const problems = await Problem.find(query)
      .select('-hiddenTestCases -__v')
      .populate('createdBy', 'username fullName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Problem.countDocuments(query);
    
    res.json({
      problems,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get problems error:', error);
    res.status(500).json({ message: 'Failed to fetch problems' });
  }
});

// GET /api/problems/:id - Get single problem (public, without hidden test cases)
router.get('/:id', async (req, res) => {
  try {
    const problem = await Problem.findOne({ _id: req.params.id, isActive: true })
      .select('-hiddenTestCases -__v')
      .populate('createdBy', 'username fullName');
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    
    res.json(problem);
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ message: 'Failed to fetch problem' });
  }
});

// POST /api/problems - Create new problem (authenticated)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      constraints,
      sampleTestCases,
      hiddenTestCases,
      allowedLanguages,
      timeLimit,
      memoryLimit,
      tags
    } = req.body;
    
    // Validation
    if (!title || !description || !difficulty || !constraints) {
      return res.status(400).json({ message: 'Title, description, difficulty, and constraints are required' });
    }
    
    if (!sampleTestCases || sampleTestCases.length === 0) {
      return res.status(400).json({ message: 'At least one sample test case is required' });
    }
    
    if (!hiddenTestCases || hiddenTestCases.length === 0) {
      return res.status(400).json({ message: 'At least one hidden test case is required' });
    }
    
    if (!allowedLanguages || allowedLanguages.length === 0) {
      return res.status(400).json({ message: 'At least one programming language must be selected' });
    }
    
    const problem = new Problem({
      title,
      description,
      difficulty,
      constraints,
      sampleTestCases,
      hiddenTestCases,
      allowedLanguages,
      timeLimit: timeLimit || 1000,
      memoryLimit: memoryLimit || 256,
      createdBy: req.user.id,
      tags: tags || []
    });
    
    await problem.save();
    
    res.status(201).json({
      message: 'Problem created successfully',
      problem: {
        id: problem._id,
        title: problem.title,
        difficulty: problem.difficulty,
        createdAt: problem.createdAt
      }
    });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ message: 'Failed to create problem' });
  }
});

// PUT /api/problems/:id - Update problem (authenticated, only by creator)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const problem = await Problem.findOne({ _id: req.params.id, createdBy: req.user.id });
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found or you are not authorized to edit it' });
    }
    
    const updates = req.body;
    delete updates.createdBy; // Prevent changing creator
    delete updates._id; // Prevent changing ID
    
    Object.assign(problem, updates);
    await problem.save();
    
    res.json({ message: 'Problem updated successfully' });
  } catch (error) {
    console.error('Update problem error:', error);
    res.status(500).json({ message: 'Failed to update problem' });
  }
});

// DELETE /api/problems/:id - Delete problem (authenticated, only by creator)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const problem = await Problem.findOne({ _id: req.params.id, createdBy: req.user.id });
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found or you are not authorized to delete it' });
    }
    
    problem.isActive = false;
    await problem.save();
    
    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    console.error('Delete problem error:', error);
    res.status(500).json({ message: 'Failed to delete problem' });
  }
});

// GET /api/problems/my - Get current user's problems
router.get('/my/problems', authenticateToken, async (req, res) => {
  try {
    const problems = await Problem.find({ createdBy: req.user.id })
      .select('-hiddenTestCases -__v')
      .sort({ createdAt: -1 });
    
    res.json(problems);
  } catch (error) {
    console.error('Get my problems error:', error);
    res.status(500).json({ message: 'Failed to fetch your problems' });
  }
});

// POST /api/problems/run - Execute code against test cases
router.post('/run', authenticateToken, async (req, res) => {
  try {
    const { problemId, code, language } = req.body;
    
    if (!problemId || !code || !language) {
      return res.status(400).json({ message: 'problemId, code, and language are required' });
    }

    const problem = await Problem.findOne({ _id: problemId, isActive: true });
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    if (!problem.allowedLanguages.includes(language)) {
      return res.status(400).json({ message: 'Language not supported for this problem' });
    }

    // Mock execution results (in a real app, you'd use a code execution service)
    const sampleResults = problem.sampleTestCases.map((testCase, index) => {
      // Simple mock: if code contains "return", it passes
      const passed = code.includes('return') || code.includes('print') || code.includes('cout');
      return {
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: passed ? testCase.output : 'Wrong answer',
        passed
      };
    });

    const hiddenResults = problem.hiddenTestCases.map((testCase, index) => {
      // Simple mock: if code contains "return", it passes
      const passed = code.includes('return') || code.includes('print') || code.includes('cout');
      return {
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: passed ? testCase.output : 'Wrong answer',
        passed
      };
    });

    const totalTests = sampleResults.length + hiddenResults.length;
    const passedTests = [...sampleResults, ...hiddenResults].filter(r => r.passed).length;
    const score = Math.round((passedTests / totalTests) * 100);

    res.json({
      sampleResults,
      hiddenResults,
      score,
      executionTime: Math.random() * 1000, // Mock execution time
      memoryUsed: Math.random() * 100 // Mock memory usage
    });
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ message: 'Code execution failed' });
  }
});

module.exports = router;
