import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      console.log('[Auth] No token provided');
      return res.status(401).json({ message: 'Access token required' });
    }

    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const decoded = jwt.verify(token, secret);
    console.log('[Auth] Token decoded successfully for user:', decoded.sub);
    
    // Fetch user from database to ensure they still exist
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = {
      sub: user._id.toString(), // Use 'sub' for consistency with JWT decode
      id: user._id,
      email: user.email,
      username: user.username
    };
    
    next();
  } catch (error) {
    console.error('[Auth] Error:', error.name, error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
};

export default authenticateToken;