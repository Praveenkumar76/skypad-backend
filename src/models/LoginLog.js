const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.models.LoginLog || mongoose.model('LoginLog', loginLogSchema);


