const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    username: { type: String, required: true },
    fullName: { type: String },
    passwordHash: { type: String, required: true },
    profilePictureUrl: { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);


