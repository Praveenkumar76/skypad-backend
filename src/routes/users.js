const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile - Get current user's profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -__v');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user profile data
    res.json({
      id: user._id,
      fullName: user.fullName || user.username,
      email: user.email,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// PUT /api/users/profile - Update current user's profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, email, username, profilePictureUrl } = req.body;
    
    console.log('Profile update request:', {
      userId: req.user.id,
      fullName,
      email,
      username,
      hasProfilePicture: !!profilePictureUrl,
      profilePictureLength: profilePictureUrl?.length
    });
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user fields
    if (fullName) user.fullName = fullName;
    if (email) user.email = email;
    if (username) user.username = username;
    if (profilePictureUrl) user.profilePictureUrl = profilePictureUrl;
    
    user.updatedAt = new Date();
    await user.save();
    
    console.log('User updated successfully:', {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      hasProfilePicture: !!user.profilePictureUrl,
      profilePictureLength: user.profilePictureUrl?.length
    });

    res.json({
      id: user._id,
      fullName: user.fullName || user.username,
      email: user.email,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// POST /api/users/solved - Mark problem as solved
router.post('/solved', authenticateToken, async (req, res) => {
  try {
    const { problemId, language } = req.body;
    
    if (!problemId) {
      return res.status(400).json({ message: 'problemId is required' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if already solved
    const alreadySolved = user.solvedProblems?.some(
      sp => sp.problemId.toString() === problemId
    );
    
    if (!alreadySolved) {
      if (!user.solvedProblems) user.solvedProblems = [];
      user.solvedProblems.push({
        problemId,
        solvedAt: new Date(),
        language: language || 'JavaScript'
      });
      await user.save();
    }
    
    res.json({ 
      message: 'Problem marked as solved',
      solvedProblems: user.solvedProblems.map(sp => sp.problemId.toString())
    });
  } catch (error) {
    console.error('Mark solved error:', error);
    res.status(500).json({ message: 'Failed to mark problem as solved' });
  }
});

// GET /api/users/solved - Get user's solved problems
router.get('/solved', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('solvedProblems');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const solvedProblemIds = (user.solvedProblems || []).map(sp => sp.problemId.toString());
    
    res.json({ 
      solvedProblems: solvedProblemIds,
      count: solvedProblemIds.length
    });
  } catch (error) {
    console.error('Get solved problems error:', error);
    res.status(500).json({ message: 'Failed to fetch solved problems' });
  }
});

module.exports = router;
