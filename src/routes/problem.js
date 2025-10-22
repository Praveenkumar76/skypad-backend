const express = require('express');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/problems - Get all problems (public)
router.get('/', async (req, res) => {
  try {
    // Check if database is connected
    const mongoose = require('mongoose');
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

    if (!topic) {
      return res.status(400).json({ message: 'Topic is required' });
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

    // Preprocess function to normalize output strings
    const preprocessOutput = (output) => {
      if (!output) return '';
      return output
        .trim()                           // Remove leading/trailing whitespace
        .replace(/\r\n/g, '\n')          // Normalize line endings (Windows -> Unix)
        .replace(/\r/g, '\n')            // Normalize line endings (Mac -> Unix)
        .replace(/\n+$/g, '')            // Remove trailing newlines
        .replace(/\s+$/gm, '')           // Remove trailing spaces from each line
        .replace(/^\s+/gm, '')           // Remove leading spaces from each line
        .replace(/\s+/g, ' ');           // Normalize multiple spaces to single space
    };

    // Mock execution results - properly evaluate Python code
    const executeTestCase = (testCase) => {
      try {
        // Check for empty or minimal code first
        const codeLines = code.trim().split('\n').filter(line => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('#'));
        if (codeLines.length === 0 || code.trim().length < 10) {
          return {
            input: testCase.input,
            expectedOutput: testCase.expectedOutput || testCase.output,
            actualOutput: 'No meaningful code provided',
            passed: false
          };
        }
        
        // Get input and expected output with correct field names
        const input = testCase.input || '';
        const expectedOutput = testCase.expectedOutput || testCase.output || '';
        
        console.log(`\n=== Test Case Debug ===`);
        console.log(`Input: "${input}"`);
        console.log(`Expected Output: "${expectedOutput}"`);
        console.log(`Language: ${language}`);
        console.log(`Code: ${code.substring(0, 150)}...`);
        
        // Simulate what the code would actually output
        let actualOutput = '';
        
        if (language.toLowerCase() === 'python') {
          // Python execution simulation - parse print statements more carefully
          const printRegex = /print\s*\(\s*([^)]*)\s*\)/g;
          let match;
          
          while ((match = printRegex.exec(code)) !== null) {
            let printContent = match[1].trim();
            
            console.log(`Found print statement: ${printContent}`);
            
            // Handle different print patterns
            try {
              // Replace input() with the actual test input value
              if (printContent.includes('input()')) {
                // Evaluate the expression with input() replaced
                let evaluatedContent = printContent;
                
                // Handle string concatenation: input() + "something"
                if (printContent.match(/input\s*\(\s*\)\s*\+/)) {
                  // Extract parts around the + operator
                  const parts = printContent.split('+').map(p => p.trim());
                  let result = '';
                  for (const part of parts) {
                    if (part.includes('input()')) {
                      result += input;
                    } else {
                      // Remove quotes from string literals
                      result += part.replace(/^["']|["']$/g, '');
                    }
                  }
                  actualOutput += result;
                } else if (printContent === 'input()') {
                  // Just print(input())
                  actualOutput += input;
                } else {
                  // input() with other operations - try basic evaluation
                  actualOutput += input;
                }
              }
              // Handle direct string literals: print("Hello World")
              else if (printContent.match(/^["'][^"']*["']$/)) {
                actualOutput += printContent.replace(/^["']|["']$/g, '');
              }
              // Handle f-strings: print(f"text")
              else if (printContent.match(/^f["'][^"']*["']$/)) {
                actualOutput += printContent.replace(/^f["']|["']$/g, '');
              }
              // Handle string concatenation: "Hello" + " " + "World"
              else if (printContent.includes('+')) {
                const parts = printContent.split('+').map(p => p.trim());
                for (const part of parts) {
                  actualOutput += part.replace(/^["']|["']$/g, '');
                }
              }
              // Handle variables or expressions - can't evaluate, show as-is
              else {
                actualOutput += `[Cannot evaluate: ${printContent}]`;
              }
            } catch (e) {
              console.error('Error evaluating print:', e);
              actualOutput += `[Error: ${printContent}]`;
            }
          }
          
          // If no print found but code has print keyword
          if (actualOutput === '' && code.includes('print')) {
            actualOutput = '[Syntax error in print statement]';
          }
          // If no print at all
          if (actualOutput === '' && !code.includes('print')) {
            actualOutput = '[No print statement found]';
          }
        } 
        else if (language.toLowerCase() === 'javascript') {
          // JavaScript execution simulation
          const consoleRegex = /console\.log\s*\(\s*([^)]*)\s*\)/g;
          let match;
          
          while ((match = consoleRegex.exec(code)) !== null) {
            let logContent = match[1].trim();
            
            // Handle string literals
            if (logContent.match(/^["'`][^"'`]*["'`]$/)) {
              actualOutput += logContent.replace(/^["'`]|["'`]$/g, '');
            }
            // Handle concatenation
            else if (logContent.includes('+')) {
              const parts = logContent.split('+').map(p => p.trim());
              for (const part of parts) {
                actualOutput += part.replace(/^["'`]|["'`]$/g, '');
              }
            }
            else {
              actualOutput += logContent;
            }
          }
          
          if (actualOutput === '' && code.includes('console.log')) {
            actualOutput = '[Syntax error in console.log]';
          }
          if (actualOutput === '' && !code.includes('console.log')) {
            actualOutput = '[No console.log found]';
          }
        }
        else if (language.toLowerCase() === 'java') {
          // Java execution simulation
          const printRegex = /System\.out\.println?\s*\(\s*([^)]*)\s*\)/g;
          let match;
          
          while ((match = printRegex.exec(code)) !== null) {
            let printContent = match[1].trim();
            actualOutput += printContent.replace(/^["]|["]$/g, '');
          }
          
          if (actualOutput === '') {
            actualOutput = '[No System.out.print found]';
          }
        }
        else if (language.toLowerCase() === 'c++' || language.toLowerCase() === 'cpp') {
          // C++ execution simulation
          const coutRegex = /cout\s*<<\s*([^;]*);/g;
          let match;
          
          while ((match = coutRegex.exec(code)) !== null) {
            let coutContent = match[1].trim();
            // Split by << operator
            const parts = coutContent.split('<<').map(p => p.trim());
            for (const part of parts) {
              if (part !== 'cout') {
                actualOutput += part.replace(/^["]|["]$/g, '').replace(/endl/g, '\n');
              }
            }
          }
          
          if (actualOutput === '') {
            actualOutput = '[No cout statement found]';
          }
        }
        else {
          actualOutput = `[${language} execution not fully supported yet]`;
        }
        
        console.log(`Simulated Output: "${actualOutput}"`);
        
        // Compare outputs using preprocessing
        const processedActualOutput = preprocessOutput(actualOutput);
        const processedExpectedOutput = preprocessOutput(expectedOutput);
        
        const passed = processedActualOutput === processedExpectedOutput;
        
        console.log(`Test Result - Passed: ${passed}`);
        console.log(`Expected (preprocessed): "${processedExpectedOutput}"`);
        console.log(`Actual (preprocessed): "${processedActualOutput}"`);
        console.log(`Match: ${processedActualOutput === processedExpectedOutput}`);
        console.log(`======================\n`);
        
        return {
          input: testCase.input || '',
          expectedOutput: testCase.expectedOutput || testCase.output || '',
          actualOutput: actualOutput || '[No output]',
          passed
        };
      } catch (error) {
        console.error('Execution error:', error);
        return {
          input: testCase.input || '',
          expectedOutput: testCase.expectedOutput || testCase.output || '',
          actualOutput: 'Runtime Error: ' + error.message,
          passed: false
        };
      }
    };
    
    const sampleResults = problem.sampleTestCases.map(executeTestCase);
    const hiddenResults = problem.hiddenTestCases.map(executeTestCase);

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
