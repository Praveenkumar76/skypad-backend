import {mongoose} from "mongoose";

const contestRegistrationSchema = new mongoose.Schema(
  {
    contestId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    registrationTime: {
      type: Date,
      default: Date.now
    },
    // Track user's progress in the contest
    score: {
      type: Number,
      default: 0
    },
    problemsSolved: [{
      problemId: { type: String, required: true },
      solvedAt: { type: Date, required: true },
      points: { type: Number, required: true }
    }],
    submissionsCount: {
      type: Number,
      default: 0
    },
    lastSubmissionTime: {
      type: Date
    },
    // Final stats
    rank: {
      type: Number
    },
    totalTimeSpent: {
      type: Number, // in seconds
      default: 0
    }
  },
  { timestamps: true }
);

// Compound index to ensure one registration per user per contest
contestRegistrationSchema.index({ contestId: 1, userId: 1 }, { unique: true });

// Index for leaderboard queries
contestRegistrationSchema.index({ contestId: 1, score: -1, lastSubmissionTime: 1 });

const ContestRegistration = mongoose.models.ContestRegistration || mongoose.model('ContestRegistration', contestRegistrationSchema);

export default ContestRegistration;