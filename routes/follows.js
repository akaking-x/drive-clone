const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Content = require('../models/Content');
const { isAuthenticated } = require('../middleware/auth');

// Search users (for follow/collab)
router.get('/api/users/search', isAuthenticated, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ success: true, users: [] });
    }

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.session.userId }
    }).select('username createdAt').limit(20);

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send follow request
router.post('/api/follows', isAuthenticated, async (req, res) => {
  try {
    const { target_id } = req.body;
    const requesterId = req.session.userId;

    if (target_id === requesterId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const target = await User.findById(target_id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Check existing
    const existing = await Follow.findOne({ requester_id: requesterId, target_id });
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already following' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'Request already pending' });
      }
      if (existing.status === 'declined') {
        // Check cooldown (24 hours)
        if (existing.cooldown_until && existing.cooldown_until > new Date()) {
          return res.status(400).json({ error: 'Please wait before requesting again' });
        }
        // Re-request
        existing.status = 'pending';
        existing.updatedAt = new Date();
        await existing.save();

        await Notification.create({
          user_id: target_id,
          type: 'follow_request',
          from_user_id: requesterId,
          message: 'sent you a follow request',
          reference_id: existing._id,
          reference_type: 'follow'
        });

        return res.json({ success: true, follow: existing });
      }
    }

    const follow = await Follow.create({
      requester_id: requesterId,
      target_id
    });

    await Notification.create({
      user_id: target_id,
      type: 'follow_request',
      from_user_id: requesterId,
      message: 'sent you a follow request',
      reference_id: follow._id,
      reference_type: 'follow'
    });

    res.json({ success: true, follow });
  } catch (error) {
    console.error('Follow request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to follow request
router.patch('/api/follows/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const { accept } = req.body;
    const follow = await Follow.findOne({
      _id: req.params.id,
      target_id: req.session.userId,
      status: 'pending'
    });

    if (!follow) return res.status(404).json({ error: 'Follow request not found' });

    follow.status = accept ? 'accepted' : 'declined';
    follow.updatedAt = new Date();
    if (!accept) {
      follow.cooldown_until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    await follow.save();

    if (accept) {
      await Notification.create({
        user_id: follow.requester_id,
        type: 'follow_accepted',
        from_user_id: req.session.userId,
        message: 'accepted your follow request',
        reference_id: follow._id,
        reference_type: 'follow'
      });
    }

    res.json({ success: true, follow });
  } catch (error) {
    console.error('Respond follow error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unfollow
router.delete('/api/follows/:targetId', isAuthenticated, async (req, res) => {
  try {
    await Follow.findOneAndDelete({
      requester_id: req.session.userId,
      target_id: req.params.targetId
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my following list
router.get('/api/follows/following', isAuthenticated, async (req, res) => {
  try {
    const follows = await Follow.find({
      requester_id: req.session.userId,
      status: 'accepted'
    }).populate('target_id', 'username');

    res.json({ success: true, following: follows });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my followers
router.get('/api/follows/followers', isAuthenticated, async (req, res) => {
  try {
    const follows = await Follow.find({
      target_id: req.session.userId,
      status: 'accepted'
    }).populate('requester_id', 'username');

    res.json({ success: true, followers: follows });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending follow requests (received)
router.get('/api/follows/pending', isAuthenticated, async (req, res) => {
  try {
    const requests = await Follow.find({
      target_id: req.session.userId,
      status: 'pending'
    }).populate('requester_id', 'username');

    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get public content of a followed user
router.get('/api/follows/:targetId/content', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const targetId = req.params.targetId;

    // Check if following
    const follow = await Follow.findOne({
      requester_id: userId,
      target_id: targetId,
      status: 'accepted'
    });

    if (!follow) {
      return res.status(403).json({ error: 'You must follow this user to view their content' });
    }

    const contents = await Content.find({
      owner: targetId,
      is_public: true
    }).populate('owner', 'username').sort({ updatedAt: -1 });

    res.json({ success: true, contents });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check follow status with a user
router.get('/api/follows/status/:targetId', isAuthenticated, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      requester_id: req.session.userId,
      target_id: req.params.targetId
    });
    res.json({ success: true, follow: follow || null });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
