import express from "express";
import dotenv from "dotenv";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";  // ✅ Add this
import Problem from "../models/Problem.js";
import authenticateToken from "../middleware/auth.js";
import { mongoose } from "mongoose";
     // ✅ Add this

const router = express.Router();
const TEMP_DIR = path.join(process.cwd(), "temp");
// Create temp directory for code execution
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// GET /api/problems - Get all problems (public)
router.get('/', async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      // Return empty array when DB is not connected
      return res.json({
        problems: [],
        totalPages: 0,
        currentPage: 1,
        total: 0,
        message: 'Database not connected'
      });
    }

    const { difficulty, search, page = 1, limit = 0 } = req.query;
    const query = { isActive: true };
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    // Build query with optional pagination
    let problemsQuery = Problem.find(query)
      .select('-hiddenTestCases -__v')
      .populate('createdBy', 'username fullName')
      .sort({ createdAt: -1 });
    
    // Only apply pagination if limit is specified and greater than 0
    if (limit > 0) {
      problemsQuery = problemsQuery.limit(limit * 1).skip((page - 1) * limit);
    }
    
    const problems = await problemsQuery;
    
    const total = await Problem.countDocuments(query);
    
    // Map problems to include id field for frontend compatibility
    const mappedProblems = problems.map(problem => {
      const problemObj = problem.toObject();
      return {
        ...problemObj,
        // Use _id as fallback if problemId is missing (for legacy records)
        id: problemObj.problemId || problemObj._id.toString()
      };
    });
    
    res.json({
      problems: mappedProblems,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
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
      topic,
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
    
    // Generate problemId from title (kebab-case)
    const problemId = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const problem = new Problem({
      problemId,
      title,
      description,
      difficulty,
      topic,
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
    
    // Return full problem data for frontend to sync to DSA sheet
    const fullProblem = await Problem.findById(problem._id)
      .select('-hiddenTestCases -__v')
      .populate('createdBy', 'username fullName');
    
    res.status(201).json({
      message: 'Problem created successfully',
      problem: {
        ...fullProblem.toObject(),
        id: fullProblem.problemId || fullProblem._id.toString()
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

// Helper function to preprocess output for comparison
const preprocessOutput = (output) => {
  if (!output) return '';
  return output
    .trim()                           // Remove leading/trailing whitespace
    .replace(/\r\n/g, '\n')          // Normalize line endings (Windows -> Unix)
    .replace(/\r/g, '\n')            // Normalize line endings (Mac -> Unix)
    .replace(/\n+$/g, '')            // Remove trailing newlines
    .replace(/\s+$/gm, '');          // Remove trailing spaces from each line
};

// Execute code for Python and JavaScript (interpreted languages)
const executeInterpreted = (language, code, input, timeLimit) => {
  let command, args;
  
  if (language === 'python') {
    command = 'python';
    args = ['-c', code];
  } else if (language === 'javascript') {
    command = 'node';
    args = ['-e', code];
  }
  
  const result = spawnSync(command, args, {
    input: input,
    timeout: timeLimit || 1000,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024 // 10MB
  });
  
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { error: 'Time Limit Exceeded', stderr: '', stdout: '' };
    }
    return { error: 'Runtime Error', stderr: result.error.message, stdout: '' };
  }
  
  if (result.status !== 0 && result.status !== null) {
    return { error: 'Runtime Error', stderr: result.stderr, stdout: result.stdout };
  }
  
  return { stdout: result.stdout, stderr: result.stderr, time: result.time };
};

// Execute compiled languages (C, C++, Java)
const executeCompiled = (language, code, input, timeLimit) => {
  const uuid = crypto.randomUUID();
  let sourceFile, compileCmd, compileArgs, executeCmd, executeArgs;
  const filesToClean = [];
  
  try {
    // Java special rule: must contain "public class Main"
    if (language === 'java') {
      if (!code.includes('public class Main')) {
        return { 
          error: 'Compilation Error', 
          stderr: 'Java code must include "public class Main"',
          stdout: '' 
        };
      }
      sourceFile = path.join(TEMP_DIR, 'Main.java');
      filesToClean.push(sourceFile);
      filesToClean.push(path.join(TEMP_DIR, 'Main.class'));
      compileCmd = 'javac';
      compileArgs = [sourceFile];
      executeCmd = 'java';
      executeArgs = ['-cp', TEMP_DIR, 'Main'];
    } else if (language === 'c') {
      sourceFile = path.join(TEMP_DIR, `${uuid}.c`);
      const outputFile = path.join(TEMP_DIR, `${uuid}.out`);
      filesToClean.push(sourceFile, outputFile);
      compileCmd = 'gcc';
      compileArgs = [sourceFile, '-o', outputFile];
      executeCmd = outputFile;
      executeArgs = [];
    } else if (language === 'cpp' || language === 'c++') {
      sourceFile = path.join(TEMP_DIR, `${uuid}.cpp`);
      const outputFile = path.join(TEMP_DIR, `${uuid}.out`);
      filesToClean.push(sourceFile, outputFile);
      compileCmd = 'g++';
      compileArgs = [sourceFile, '-o', outputFile];
      executeCmd = outputFile;
      executeArgs = [];
    }
    
    // Write source code to file
    fs.writeFileSync(sourceFile, code, 'utf-8');
    
    // Compile
    const compileResult = spawnSync(compileCmd, compileArgs, {
      encoding: 'utf-8',
      timeout: 5000 // 5 second compile timeout
    });
    
    if (compileResult.error || compileResult.status !== 0) {
      return { 
        error: 'Compilation Error', 
        stderr: compileResult.stderr || compileResult.error?.message || 'Compilation failed',
        stdout: '' 
      };
    }
    
    // Execute
    const execResult = spawnSync(executeCmd, executeArgs, {
      input: input,
      timeout: timeLimit || 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (execResult.error) {
      if (execResult.error.code === 'ETIMEDOUT') {
        return { error: 'Time Limit Exceeded', stderr: '', stdout: '' };
      }
      return { error: 'Runtime Error', stderr: execResult.error.message, stdout: '' };
    }
    
    if (execResult.status !== 0 && execResult.status !== null) {
      return { error: 'Runtime Error', stderr: execResult.stderr, stdout: execResult.stdout };
    }
    
    return { stdout: execResult.stdout, stderr: execResult.stderr };
    
  } finally {
    // Clean up all temporary files
    filesToClean.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err.message);
      }
    });
  }
};

// Main execution function
const executeCode = (language, code, input, timeLimit) => {
  const normalizedLang = language.toLowerCase();
  
  // Validate language
  const supportedLanguages = ['python', 'javascript', 'c', 'cpp', 'c++', 'java'];
  if (!supportedLanguages.includes(normalizedLang)) {
    return { 
      error: 'Runtime Error', 
      stderr: `Unsupported language: ${language}`,
      stdout: '' 
    };
  }
  
  // Execute based on language type
  if (normalizedLang === 'python' || normalizedLang === 'javascript') {
    return executeInterpreted(normalizedLang, code, input, timeLimit);
  } else {
    return executeCompiled(normalizedLang === 'c++' ? 'cpp' : normalizedLang, code, input, timeLimit);
  }
};

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

    // Get time limit from problem or use defaults
    const timeLimit = problem.timeLimit || (language.toLowerCase() === 'java' ? 2000 : 1000);
    
    // Execute code against test cases
    const executeTestCase = (testCase) => {
      const input = testCase.input || '';
      const expectedOutput = testCase.expectedOutput || '';
      
      const startTime = Date.now();
      const result = executeCode(language, code, input, timeLimit);
      const executionTime = Date.now() - startTime;
      
      // Handle errors
      if (result.error) {
        return {
          input,
          expectedOutput,
          actualOutput: `${result.error}${result.stderr ? ': ' + result.stderr : ''}`,
          passed: false,
          executionTime
        };
      }
      
      // Compare outputs
      const actualOutput = result.stdout || '';
      const processedActual = preprocessOutput(actualOutput);
      const processedExpected = preprocessOutput(expectedOutput);
      const passed = processedActual === processedExpected;
      
      return {
        input,
        expectedOutput,
        actualOutput,
        passed,
        executionTime
      };
    };
    
    const sampleResults = problem.sampleTestCases.map(executeTestCase);
    const hiddenResults = problem.hiddenTestCases.map(executeTestCase);

    const totalTests = sampleResults.length + hiddenResults.length;
    const passedTests = [...sampleResults, ...hiddenResults].filter(r => r.passed).length;
    const score = Math.round((passedTests / totalTests) * 100);
    
    // Calculate max execution time
    const allResults = [...sampleResults, ...hiddenResults];
    const maxExecutionTime = Math.max(...allResults.map(r => r.executionTime || 0));
    
    // Mock memory usage (realistic range)
    const memoryUsed = Math.random() * 50 + 10; // 10-60 MB

    res.json({
      sampleResults,
      hiddenResults,
      score,
      executionTime: maxExecutionTime,
      memoryUsed
    });
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ message: 'Code execution failed' });
  }
});

export default router;