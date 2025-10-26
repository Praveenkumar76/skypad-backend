const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/skypad', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const Problem = require('../src/models/Problem');

async function migrateTestCases() {
  try {
    console.log('Starting migration...');
    
    // Find all problems
    const problems = await Problem.find({});
    console.log(`Found ${problems.length} problems`);
    
    let updatedCount = 0;
    
    for (const problem of problems) {
      let needsUpdate = false;
      
      // Fix missing required fields
      if (!problem.problemId) {
        problem.problemId = problem.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        needsUpdate = true;
        console.log(`  → Added problemId: ${problem.problemId}`);
      }
      
      if (!problem.topic) {
        problem.topic = 'Array'; // Default topic
        needsUpdate = true;
        console.log(`  → Added default topic`);
      }
      
      // Check and fix sampleTestCases
      if (problem.sampleTestCases && problem.sampleTestCases.length > 0) {
        problem.sampleTestCases = problem.sampleTestCases.map(testCase => {
          const tc = testCase.toObject ? testCase.toObject() : testCase;
          
          // If it has 'output' but not 'expectedOutput', migrate it
          if (tc.output && !tc.expectedOutput) {
            needsUpdate = true;
            return {
              input: tc.input,
              expectedOutput: tc.output,
              explanation: tc.explanation
            };
          }
          
          // If it has neither, add empty expectedOutput
          if (!tc.expectedOutput) {
            needsUpdate = true;
            return {
              input: tc.input || '',
              expectedOutput: '',
              explanation: tc.explanation
            };
          }
          
          return tc;
        });
      }
      
      // Check and fix hiddenTestCases
      if (problem.hiddenTestCases && problem.hiddenTestCases.length > 0) {
        problem.hiddenTestCases = problem.hiddenTestCases.map(testCase => {
          const tc = testCase.toObject ? testCase.toObject() : testCase;
          
          // If it has 'output' but not 'expectedOutput', migrate it
          if (tc.output && !tc.expectedOutput) {
            needsUpdate = true;
            return {
              input: tc.input,
              expectedOutput: tc.output
            };
          }
          
          // If it has neither, add empty expectedOutput
          if (!tc.expectedOutput) {
            needsUpdate = true;
            return {
              input: tc.input || '',
              expectedOutput: ''
            };
          }
          
          return tc;
        });
      }
      
      if (needsUpdate) {
        await problem.save();
        updatedCount++;
        console.log(`✓ Updated problem: ${problem.title}`);
      }
    }
    
    console.log(`\nMigration complete!`);
    console.log(`Updated ${updatedCount} out of ${problems.length} problems`);
    
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrateTestCases();
