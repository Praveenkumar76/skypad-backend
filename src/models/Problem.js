const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema(
  {
    problemId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    difficulty: { 
      type: String, 
      enum: ['Easy', 'Medium', 'Hard'], 
      required: true 
    },
    topic: { 
      type: String, 
      enum: ['Array', 'String', 'Tree', 'Graph', 'Dynamic Programming', 'Linked List', 'Stack', 'Queue', 'Greedy', 'Recursion'],
      required: false 
    },
    tags: [{ type: String }],
    constraints: { type: String },
    sampleTestCases: [{
      input: { type: String, required: true },
      expectedOutput: { type: String, required: true },
      explanation: { type: String }
    }],
    hiddenTestCases: [{
      input: { type: String, required: true },
      expectedOutput: { type: String, required: true }
    }],
    allowedLanguages: [{ type: String }],
    timeLimit: { type: Number, default: 1000 }, // in milliseconds
    memoryLimit: { type: Number, default: 256 }, // in MB
    points: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    solvedBy: [{ 
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      solvedAt: { type: Date, default: Date.now },
      timeSpent: { type: Number, default: 0 },
      language: { type: String }
    }]
  },
  { timestamps: true }
);

// Index for efficient queries
problemSchema.index({ difficulty: 1, topic: 1 });
problemSchema.index({ isActive: 1 });

module.exports = mongoose.models.Problem || mongoose.model('Problem', problemSchema);