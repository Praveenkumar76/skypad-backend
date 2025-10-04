const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in hours
    required: true
  },
  problems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem'
  }],
  type: {
    type: String,
    enum: ['Public', 'Private'],
    default: 'Public'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  allowedLanguages: [{
    type: String,
    enum: ['JavaScript', 'Python', 'Java', 'C++', 'C', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin'],
    required: true
  }],
  collaboration: {
    type: Boolean,
    default: false
  },
  leaderboard: {
    type: Boolean,
    default: true
  },
  participants: [{
    type: String, // usernames or emails
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Published', 'Active', 'Ended', 'Cancelled'],
    default: 'Draft'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
contestSchema.index({ createdBy: 1, status: 1 });
contestSchema.index({ startTime: 1, endTime: 1 });
contestSchema.index({ type: 1, status: 1 });
contestSchema.index({ tags: 1 });

// Virtual for checking if contest is currently active
contestSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.status === 'Published' && 
         this.startTime <= now && 
         this.endTime >= now;
});

// Virtual for checking if contest has ended
contestSchema.virtual('hasEnded').get(function() {
  const now = new Date();
  return this.endTime < now;
});

// Virtual for checking if contest is upcoming
contestSchema.virtual('isUpcoming').get(function() {
  const now = new Date();
  return this.status === 'Published' && this.startTime > now;
});

// Method to update status based on time
contestSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (this.status === 'Published') {
    if (this.startTime <= now && this.endTime >= now) {
      this.status = 'Active';
    } else if (this.endTime < now) {
      this.status = 'Ended';
    }
  }
  
  return this.save();
};

// Pre-save middleware to validate end time
contestSchema.pre('save', function(next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    const error = new Error('End time must be after start time');
    return next(error);
  }
  next();
});

// Pre-save middleware to calculate duration
contestSchema.pre('save', function(next) {
  if (this.startTime && this.endTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / (1000 * 60 * 60)); // in hours
  }
  next();
});

module.exports = mongoose.model('Contest', contestSchema);
