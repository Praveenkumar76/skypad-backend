import {mongoose} from "mongoose";

const loginLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

const LoginLog = mongoose.models.LoginLog || mongoose.model('LoginLog', loginLogSchema);

export default LoginLog;