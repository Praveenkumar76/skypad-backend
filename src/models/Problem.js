const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    difficulty: { 
      type: String, 
      enum: ['Easy', 'Medium', 'Hard'], 
      required: true 
    },
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
    allowedLanguages: [{
      type: String,
      enum: ['JavaScript', 'Python', 'Java', 'C++', 'C'],
      required: true
    }],
    timeLimit: { type: Number, default: 1000 }, // in milliseconds
    memoryLimit: { type: Number, default: 256 }, // in MB
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Index for better query performance
problemSchema.index({ title: 'text', description: 'text' });
problemSchema.index({ difficulty: 1, isActive: 1 });
problemSchema.index({ createdBy: 1 });

module.exports = mongoose.models.Problem || mongoose.model('Problem', problemSchema);
