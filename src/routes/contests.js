const express = require('express');
const Contest = require('../models/Contest');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/contests - Get all contests
router.get('/', async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }
    
    const contests = await Contest.find(query)
      .populate('problems', 'title difficulty tags')
      .populate('createdBy', 'username fullName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Contest.countDocuments(query);
    
    res.json({
      contests,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get contests error:', error);
    res.status(500).json({ message: 'Failed to fetch contests' });
  }
});

// GET /api/contests/:id - Get single contest
router.get('/:id', async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('problems')
      .populate('createdBy', 'username fullName');
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    res.json(contest);
  } catch (error) {
    console.error('Get contest error:', error);
    res.status(500).json({ message: 'Failed to fetch contest' });
  }
});

// POST /api/contests - Create new contest
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      type,
      tags,
      allowedLanguages,
      collaboration,
      leaderboard,
      participants,
      problems,
      status = 'Draft'
    } = req.body;
    
    // Validation
    if (!title || !description || !startTime || !endTime) {
      return res.status(400).json({ 
        message: 'Title, description, start time, and end time are required' 
      });
    }
    
    if (new Date(endTime) <= new Date(startTime)) {
      return res.status(400).json({ 
        message: 'End time must be after start time' 
      });
    }
    
    if (!allowedLanguages || allowedLanguages.length === 0) {
      return res.status(400).json({ 
        message: 'At least one programming language must be selected' 
      });
    }
    
    const contest = new Contest({
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      duration: Math.floor((new Date(endTime) - new Date(startTime)) / (1000 * 60 * 60)), // in hours
      type: type || 'Public',
      tags: tags || [],
      allowedLanguages,
      collaboration: collaboration || false,
      leaderboard: leaderboard !== false,
      participants: participants || [],
      problems: problems || [],
      createdBy: req.user.id,
      status
    });
    
    await contest.save();
    
    res.status(201).json({
      message: 'Contest created successfully',
      contest: await Contest.findById(contest._id)
        .populate('problems', 'title difficulty tags')
        .populate('createdBy', 'username fullName')
    });
  } catch (error) {
    console.error('Create contest error:', error);
    res.status(500).json({ message: 'Failed to create contest' });
  }
});

// PUT /api/contests/:id - Update contest
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Check if user is the creator or admin
    if (contest.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this contest' });
    }
    
    const {
      title,
      description,
      startTime,
      endTime,
      type,
      tags,
      allowedLanguages,
      collaboration,
      leaderboard,
      participants,
      problems
    } = req.body;
    
    // Update fields
    if (title) contest.title = title;
    if (description) contest.description = description;
    if (startTime) contest.startTime = new Date(startTime);
    if (endTime) contest.endTime = new Date(endTime);
    if (type) contest.type = type;
    if (tags) contest.tags = tags;
    if (allowedLanguages) contest.allowedLanguages = allowedLanguages;
    if (collaboration !== undefined) contest.collaboration = collaboration;
    if (leaderboard !== undefined) contest.leaderboard = leaderboard;
    if (participants) contest.participants = participants;
    if (problems) contest.problems = problems;
    
    // Recalculate duration
    if (startTime || endTime) {
      contest.duration = Math.floor((contest.endTime - contest.startTime) / (1000 * 60 * 60));
    }
    
    await contest.save();
    
    res.json({
      message: 'Contest updated successfully',
      contest: await Contest.findById(contest._id)
        .populate('problems', 'title difficulty tags')
        .populate('createdBy', 'username fullName')
    });
  } catch (error) {
    console.error('Update contest error:', error);
    res.status(500).json({ message: 'Failed to update contest' });
  }
});

// PATCH /api/contests/:id/publish - Publish contest
router.patch('/:id/publish', authenticateToken, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Check if user is the creator or admin
    if (contest.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to publish this contest' });
    }
    
    // Validate contest before publishing
    if (!contest.problems || contest.problems.length === 0) {
      return res.status(400).json({ message: 'Contest must have at least one problem to publish' });
    }
    
    if (!contest.allowedLanguages || contest.allowedLanguages.length === 0) {
      return res.status(400).json({ message: 'Contest must have at least one allowed language to publish' });
    }
    
    contest.status = 'Published';
    await contest.save();
    
    res.json({
      message: 'Contest published successfully',
      contest: await Contest.findById(contest._id)
        .populate('problems', 'title difficulty tags')
        .populate('createdBy', 'username fullName')
    });
  } catch (error) {
    console.error('Publish contest error:', error);
    res.status(500).json({ message: 'Failed to publish contest' });
  }
});

// POST /api/contests/:id/problems - Add problems to contest
router.post('/:id/problems', authenticateToken, async (req, res) => {
  try {
    const { problemIds } = req.body;
    
    if (!problemIds || !Array.isArray(problemIds)) {
      return res.status(400).json({ message: 'Problem IDs array is required' });
    }
    
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Check if user is the creator or admin
    if (contest.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to modify this contest' });
    }
    
    // Add new problems (avoid duplicates)
    const existingProblemIds = contest.problems.map(p => p.toString());
    const newProblemIds = problemIds.filter(id => !existingProblemIds.includes(id));
    
    contest.problems = [...contest.problems, ...newProblemIds];
    await contest.save();
    
    res.json({
      message: 'Problems added successfully',
      contest: await Contest.findById(contest._id)
        .populate('problems', 'title difficulty tags')
        .populate('createdBy', 'username fullName')
    });
  } catch (error) {
    console.error('Add problems error:', error);
    res.status(500).json({ message: 'Failed to add problems' });
  }
});

// DELETE /api/contests/:id - Delete contest
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    // Check if user is the creator or admin
    if (contest.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this contest' });
    }
    
    await Contest.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Contest deleted successfully' });
  } catch (error) {
    console.error('Delete contest error:', error);
    res.status(500).json({ message: 'Failed to delete contest' });
  }
});

module.exports = router;
