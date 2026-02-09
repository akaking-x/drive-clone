const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { isAuthenticated } = require('../middleware/auth');

// Get notifications
router.get('/api/notifications', isAuthenticated, async (req, res) => {
  try {
    const { limit = 30, offset = 0 } = req.query;
    const notifications = await Notification.find({ user_id: req.session.userId })
      .populate('from_user_id', 'username')
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread count
router.get('/api/notifications/unread-count', isAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user_id: req.session.userId,
      is_read: false
    });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark as read
router.patch('/api/notifications/mark-read', isAuthenticated, async (req, res) => {
  try {
    const { ids } = req.body; // array of notification ids, or 'all'
    const filter = { user_id: req.session.userId, is_read: false };
    if (ids && ids !== 'all') {
      filter._id = { $in: ids };
    }
    await Notification.updateMany(filter, { is_read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete notification
router.delete('/api/notifications/:id', isAuthenticated, async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      user_id: req.session.userId
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
