const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

function createToken(payload) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

router.post('/register', async (req, res) => {
  try {
    const { email, username, fullName, password } = req.body || {};
    if (!email || !username || !fullName || !password) {
      return res.status(400).json({ message: 'email, username, fullName and password are required' });
    }

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      // Mock registration for development when database is not available
      console.log('Database not available, using mock registration');
      
      const mockUser = {
        id: 'mock-user-id-' + Date.now(),
        email: email,
        username: username,
        fullName: fullName
      };
      
      const token = createToken({ 
        sub: mockUser.id, 
        email: mockUser.email, 
        username: mockUser.username, 
        fullName: mockUser.fullName 
      });
      
      return res.status(201).json({ 
        token, 
        user: mockUser,
        message: 'Mock registration - Database not available'
      });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, username, fullName, passwordHash });
    const safeFullName = user.fullName || user.username;
    const token = createToken({ sub: user.id, email: user.email, username: user.username, fullName: safeFullName });
    return res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username, fullName: safeFullName } });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    // Check if database is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      // Mock authentication for development when database is not available
      console.log('Database not available, using mock authentication');
      
      // For development, accept any email/password combination
      // In production, this should never happen
      const mockUser = {
        id: 'mock-user-id',
        email: email,
        username: email.split('@')[0],
        fullName: email.split('@')[0]
      };
      
      const token = createToken({ 
        sub: mockUser.id, 
        email: mockUser.email, 
        username: mockUser.username, 
        fullName: mockUser.fullName 
      });
      
      return res.json({ 
        token, 
        user: mockUser, 
        lastLoginAt: new Date(),
        message: 'Mock authentication - Database not available'
      });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Update last login and record login log
    user.lastLoginAt = new Date();
    await user.save();

    await LoginLog.create({
      userId: user._id,
      ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || ''
    });

    const safeFullName = user.fullName || user.username;
    const token = createToken({ sub: user.id, email: user.email, username: user.username, fullName: safeFullName });
    return res.json({ token, user: { id: user.id, email: user.email, username: user.username, fullName: safeFullName }, lastLoginAt: user.lastLoginAt });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// POST /api/auth/google - Exchange Google ID token for app JWT
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ message: 'idToken is required' });
    }
    if (!googleClient) {
      return res.status(500).json({ message: 'Google OAuth not configured' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientId });
    const payload = ticket.getPayload();
    const email = String(payload.email || '').toLowerCase();
    const fullName = payload.name || payload.given_name || 'User';
    const picture = payload.picture || null;

    if (!email) {
      return res.status(400).json({ message: 'Google account has no email' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const usernameBase = (fullName || email).split(' ')[0].toLowerCase();
      const username = usernameBase || email.split('@')[0];
      user = await User.create({ email, username, fullName, passwordHash: await bcrypt.hash(jwt.sign({ sub: email }, 'seed'), 6), profilePictureUrl: picture });
    }

    user.lastLoginAt = new Date();
    if (picture && user.profilePictureUrl !== picture) {
      user.profilePictureUrl = picture;
    }
    await user.save();

    await LoginLog.create({
      userId: user._id,
      ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || '',
      profilePictureUrl: user.profilePictureUrl || null
    });

    const safeFullName = user.fullName || user.username;
    const token = createToken({ sub: user.id, email: user.email, username: user.username, fullName: safeFullName });
    return res.json({ token, user: { id: user.id, email: user.email, username: user.username, fullName: safeFullName, profilePictureUrl: user.profilePictureUrl || null }, lastLoginAt: user.lastLoginAt });
  } catch (err) {
    console.error('Google auth error', err);
    return res.status(401).json({ message: 'Google authentication failed' });
  }
});

module.exports = router;