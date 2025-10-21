const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema(
  {
    contestId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    shareableLink: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Contest settings
    allowedLanguages: [{
      type: String,
      enum: ['javascript', 'python', 'cpp', 'java']
    }],
    maxParticipants: {
      type: Number,
      default: null // null means unlimited
    },
    // Contest problems with points
    problems: [{
      problemId: { type: String, required: true },
      points: { type: Number, required: true, default: 10 },
      order: { type: Number, required: true }
    }],
    // Contest questions (embedded questions for the contest)
    questions: [{
      title: { type: String, required: true },
      description: { type: String, required: true },
      difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
      constraints: { type: String, required: true },
      sampleTestCases: [{
        input: { type: String, required: true },
        output: { type: String, required: true },
        explanation: { type: String }
      }],
      hiddenTestCases: [{
        input: { type: String, required: true },
        output: { type: String, required: true }
      }],
      timeLimit: { type: Number, default: 2000 },
      memoryLimit: { type: Number, default: 256 },
      points: { type: Number, required: true, default: 100 },
      order: { type: Number, required: true },
      tags: [String],
      questionId: { type: String, required: true }
    }],
    // Time slots for the contest date
    timeSlots: [{
      startTime: { type: Date, required: true },
      endTime: { type: Date, required: true },
      isSelected: { type: Boolean, default: false }
    }],
    // Statistics
    stats: {
      totalParticipants: { type: Number, default: 0 },
      totalSubmissions: { type: Number, default: 0 },
      problemsSolved: { type: Number, default: 0 }
    },
    // Status
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'ended'],
      default: 'draft'
    }
  },
  { timestamps: true }
);

// Indexes for querying
contestSchema.index({ status: 1, startTime: -1 });
contestSchema.index({ visibility: 1, status: 1 });
contestSchema.index({ creatorId: 1 });

// Method to generate unique contest ID (format: c-abc123)
contestSchema.statics.generateContestId = function() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'c-';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// Method to generate unique question ID (format: q-abc123)
contestSchema.statics.generateQuestionId = function() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'q-';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// Method to check if contest is active
contestSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' || (now >= this.startTime && now <= this.endTime);
};

// Method to check if contest has started
contestSchema.methods.hasStarted = function() {
  return new Date() >= this.startTime;
};

// Method to check if contest has ended
contestSchema.methods.hasEnded = function() {
  return new Date() > this.endTime || this.status === 'ended';
};

// Method to get contest state
contestSchema.methods.getState = function() {
  const now = new Date();
  
  if (this.status === 'draft') {
    return 'draft';
  }
  
  if (now < this.startTime) {
    return 'upcoming';
  }
  
  if (now >= this.startTime && now <= this.endTime) {
    return 'active';
  }
  
  return 'ended';
};

module.exports = mongoose.models.Contest || mongoose.model('Contest', contestSchema);

