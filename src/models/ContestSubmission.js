const mongoose = require('mongoose');

const contestSubmissionSchema = new mongoose.Schema(
  {
    contestId: {
      type: String,
      required: true,
      index: true
    },
    problemId: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    code: {
      type: String,
      required: true
    },
    language: {
      type: String,
      required: true,
      enum: ['javascript', 'python', 'cpp', 'java']
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'wrong_answer', 'runtime_error', 'time_limit_exceeded', 'compilation_error'],
      default: 'pending'
    },
    testResults: {
      type: Object
    },
    points: {
      type: Number,
      default: 0
    },
    executionTime: {
      type: Number // in milliseconds
    },
    memory: {
      type: Number // in KB
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    // Time from contest start
    timeTaken: {
      type: Number // in seconds from contest start
    }
  },
  { timestamps: true }
);

// Indexes for queries
contestSubmissionSchema.index({ contestId: 1, userId: 1, timestamp: -1 });
contestSubmissionSchema.index({ contestId: 1, problemId: 1, status: 1 });
contestSubmissionSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.models.ContestSubmission || mongoose.model('ContestSubmission', contestSubmissionSchema);

