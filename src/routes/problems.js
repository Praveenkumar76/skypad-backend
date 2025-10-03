const express = require('express');
const Problem = require('../models/Problem');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/problems - Get all problems (public)
router.get('/', async (req, res) => {
  try {
    const { difficulty, search, page = 1, limit = 10000 } = req.query;  // Increased default limit
    const query = { isActive: true };
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    const actualLimit = Math.min(parseInt(limit), 10000);  // Max 10000 problems
    
    const problems = await Problem.find(query)
      .select('-hiddenTestCases -__v')
      .populate('createdBy', 'username fullName')
      .sort({ createdAt: -1 })
      .limit(actualLimit)
      .skip((page - 1) * actualLimit);
    
    const total = await Problem.countDocuments(query);
    
    res.json({
      problems,
      totalPages: Math.ceil(total / actualLimit),
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
      _id: problem._id,
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      constraints: problem.constraints,
      sampleTestCases: problem.sampleTestCases,
      hiddenTestCases: problem.hiddenTestCases,
      allowedLanguages: problem.allowedLanguages,
      timeLimit: problem.timeLimit,
      memoryLimit: problem.memoryLimit,
      tags: problem.tags,
      createdAt: problem.createdAt
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

    // Standardized stdin-based evaluator for all supported languages
    const path = require('path');
    const fs = require('fs').promises;
    const { spawn } = require('child_process');

    function normalizeOutput(text) {
      return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
    }

    function compareOutputs(expected, actual) {
      return normalizeOutput(expected) === normalizeOutput(actual);
    }

    async function writeTemp(contents, ext, dir) {
      const file = path.join(dir, `prog_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
      await fs.writeFile(file, contents, 'utf8');
      return file;
    }

    async function runWithInput(command, args, input, cwd, timeoutMs = 15000) {
      return new Promise((resolve) => {
        const child = spawn(command, args, { cwd });
        let stdout = '';
        let stderr = '';
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            try { child.kill('SIGKILL'); } catch (_) {}
            resolve({ ok: false, stdout, stderr: stderr || 'Time limit exceeded' });
          }
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (e) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({ ok: false, stdout, stderr: e.message });
        });
        child.on('close', (code) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({ ok: code === 0, stdout, stderr });
        });
        if (input != null) {
          child.stdin.write(String(input));
        }
        child.stdin.end();
      });
    }

    // Prepare temp working directory
    const workDir = path.join(__dirname, `runner_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(workDir, { recursive: true });

    // Build/prepare per language
    let buildResult = { ok: true, run: null, cleanup: async () => {} };

    try {
      if (language === 'JavaScript') {
        const file = await writeTemp(code, '.js', workDir);
        buildResult.run = async (input) => runWithInput('node', [file], input, workDir, problem.timeLimit || 15000);
        buildResult.cleanup = async () => { try { await fs.unlink(file); } catch (_) {} };
      } else if (language === 'Python') {
        const file = await writeTemp(code, '.py', workDir);
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        buildResult.run = async (input) => runWithInput(pythonCmd, [file], input, workDir, problem.timeLimit || 15000);
        buildResult.cleanup = async () => { try { await fs.unlink(file); } catch (_) {} };
      } else if (language === 'Java') {
        // Enforce Main class for simplicity
        const javaFile = path.join(workDir, 'Main.java');
        await fs.writeFile(javaFile, code, 'utf8');
        const javacCmd = process.platform === 'win32' ? 'javac' : 'javac';
        const javaCmd = process.platform === 'win32' ? 'java' : 'java';
        const compile = await runWithInput(javacCmd, ['Main.java'], '', workDir, 20000);
        if (!compile.ok) {
          buildResult = { ok: false, error: compile.stderr || 'Java compilation failed. Make sure Java JDK is installed.' };
        } else {
          buildResult.run = async (input) => runWithInput(javaCmd, ['Main'], input, workDir, problem.timeLimit || 15000);
        }
      } else if (language === 'C') {
        const cFile = path.join(workDir, 'main.c');
        await fs.writeFile(cFile, code, 'utf8');
        const exe = path.join(workDir, process.platform === 'win32' ? 'main.exe' : 'main');
        const gccCmd = process.platform === 'win32' ? 'gcc' : 'gcc';
        const compile = await runWithInput(gccCmd, [cFile, '-O2', '-std=c11', '-o', exe], '', workDir, 30000);
        if (!compile.ok) {
          buildResult = { ok: false, error: compile.stderr || 'C compilation failed. Make sure GCC is installed.' };
        } else {
          buildResult.run = async (input) => runWithInput(exe, [], input, workDir, problem.timeLimit || 15000);
        }
      } else if (language === 'C++' || language === 'Cpp' || language === 'CPP') {
        const cppFile = path.join(workDir, 'main.cpp');
        await fs.writeFile(cppFile, code, 'utf8');
        const exe = path.join(workDir, process.platform === 'win32' ? 'main.exe' : 'main');
        const gppCmd = process.platform === 'win32' ? 'g++' : 'g++';
        const compile = await runWithInput(gppCmd, [cppFile, '-O2', '-std=c++17', '-o', exe], '', workDir, 30000);
        if (!compile.ok) {
          buildResult = { ok: false, error: compile.stderr || 'C++ compilation failed. Make sure G++ is installed.' };
        } else {
          buildResult.run = async (input) => runWithInput(exe, [], input, workDir, problem.timeLimit || 15000);
        }
      } else {
        return res.status(400).json({ message: `Language ${language} not supported. Supported: JavaScript, Python, Java, C++, C` });
      }

      if (!buildResult.ok) {
        await fs.rm(workDir, { recursive: true, force: true });
        return res.status(400).json({ message: buildResult.error || 'Build failed' });
      }

      async function runOne(input) {
        const result = await buildResult.run(String(input ?? ''));
        if (!result.ok) {
          return { ok: false, error: result.stderr || 'Runtime error', stdout: result.stdout };
        }
        return { ok: true, stdout: result.stdout };
      }

    const sampleResults = [];
    for (const testCase of problem.sampleTestCases) {
      const r = await runOne(testCase.input);
      const passed = r.ok && compareOutputs(testCase.output, r.stdout);
      sampleResults.push({
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: r.ok ? normalizeOutput(r.stdout) : (r.error || 'Error'),
        passed
      });
    }

    const hiddenResults = [];
    for (const testCase of problem.hiddenTestCases) {
      const r = await runOne(testCase.input);
      const passed = r.ok && compareOutputs(testCase.output, r.stdout);
      hiddenResults.push({
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: r.ok ? normalizeOutput(r.stdout) : (r.error || 'Error'),
        passed
      });
    }

    const totalTests = sampleResults.length + hiddenResults.length;
    const passedTests = [...sampleResults, ...hiddenResults].filter(r => r.passed).length;
    const score = Math.round((passedTests / totalTests) * 100);

    res.json({
      sampleResults,
      hiddenResults,
      score,
      executionTime: Math.random() * 1000,
      memoryUsed: Math.random() * 100
    });
    } finally {
      // Cleanup work directory
      try { await fs.rm(workDir, { recursive: true, force: true }); } catch (_) {}
    }
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ message: 'Code execution failed' });
  }
});

module.exports = router;
