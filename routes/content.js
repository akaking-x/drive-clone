const express = require('express');
const router = express.Router();
const Content = require('../models/Content');
const VideoPost = require('../models/VideoPost');
const User = require('../models/User');
const CollabActivityLog = require('../models/CollabActivityLog');
const { isAuthenticated } = require('../middleware/auth');

// Get all content for current user (owned + collaborating)
router.get('/api/content', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { category, search } = req.query;

    const query = {
      $or: [
        { owner: userId },
        { 'collaborators.user_id': userId, 'collaborators.status': 'accepted' }
      ]
    };

    if (category) query.category = category;
    if (search) query.content_name = { $regex: search, $options: 'i' };

    const contents = await Content.find(query)
      .populate('owner', 'username')
      .sort({ updatedAt: -1 });

    res.json({ success: true, contents });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single content
router.get('/api/content/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const content = await Content.findById(req.params.id)
      .populate('owner', 'username')
      .populate('collaborators.user_id', 'username');

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Check access
    const isOwner = content.owner._id.toString() === userId;
    const isCollab = content.collaborators.some(
      c => c.user_id && c.user_id._id.toString() === userId && c.status === 'accepted'
    );

    if (!isOwner && !isCollab && !content.is_public) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ success: true, content, isOwner, isCollab });
  } catch (error) {
    console.error('Get content detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create content
router.post('/api/content', isAuthenticated, async (req, res) => {
  try {
    const { content_name, category, platform_tags, reference_links, description } = req.body;

    if (!content_name || !content_name.trim()) {
      return res.status(400).json({ error: 'Content name is required' });
    }

    const content = new Content({
      content_name: content_name.trim(),
      owner: req.session.userId,
      category: category || '',
      platform_tags: platform_tags || [],
      reference_links: reference_links || [],
      description: description || ''
    });

    await content.save();
    await content.populate('owner', 'username');

    res.json({ success: true, content });
  } catch (error) {
    console.error('Create content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update content
router.patch('/api/content/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const content = await Content.findById(req.params.id);

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Only owner or editor can update
    const isOwner = content.owner.toString() === userId;
    const isEditor = content.collaborators.some(
      c => c.user_id.toString() === userId && c.role === 'editor' && c.status === 'accepted'
    );

    if (!isOwner && !isEditor) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const allowed = ['content_name', 'category', 'platform_tags', 'reference_links', 'description', 'is_public'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        content[field] = req.body[field];
      }
    });

    await content.save();
    await content.populate('owner', 'username');

    res.json({ success: true, content });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete content
router.delete('/api/content/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const content = await Content.findOne({ _id: req.params.id, owner: userId });

    if (!content) {
      return res.status(404).json({ error: 'Content not found or not owner' });
    }

    // Delete all video posts under this content
    const posts = await VideoPost.find({ content_id: content._id });
    const s3Service = require('../services/s3');

    for (const post of posts) {
      if (s3Service.isS3Configured()) {
        if (post.video && post.video.s3Key) {
          try { await s3Service.deleteFile(post.video.s3Key); } catch (e) {}
        }
        if (post.thumbnail && post.thumbnail.s3Key) {
          try { await s3Service.deleteFile(post.thumbnail.s3Key); } catch (e) {}
        }
      }
    }

    await VideoPost.deleteMany({ content_id: content._id });
    await CollabActivityLog.deleteMany({ content_id: content._id });
    await Content.findByIdAndDelete(content._id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get categories for current user
router.get('/api/content-categories', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const categories = await Content.distinct('category', {
      $or: [
        { owner: userId },
        { 'collaborators.user_id': userId, 'collaborators.status': 'accepted' }
      ],
      category: { $ne: '' }
    });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// === Collaboration Endpoints ===

// Invite collaborator
router.post('/api/content/:id/collaborators', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { username, role } = req.body;

    const content = await Content.findOne({ _id: req.params.id, owner: userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found or not owner' });
    }

    const targetUser = await User.findOne({ username });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser._id.toString() === userId) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    // Check if already invited
    const existing = content.collaborators.find(
      c => c.user_id.toString() === targetUser._id.toString()
    );
    if (existing) {
      return res.status(400).json({ error: 'User already invited' });
    }

    content.collaborators.push({
      user_id: targetUser._id,
      role: role || 'viewer',
      invited_by: userId,
      status: 'pending'
    });

    await content.save();

    // Create notification
    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: targetUser._id,
      type: 'collab_invite',
      from_user_id: userId,
      message: `invited you to collaborate on "${content.content_name}"`,
      reference_id: content._id,
      reference_type: 'content'
    });

    // Log activity
    await CollabActivityLog.create({
      content_id: content._id,
      actor_id: userId,
      action: 'invite',
      target: targetUser._id.toString(),
      details: `Invited ${targetUser.username} as ${role || 'viewer'}`
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Invite collaborator error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to collaboration invite
router.patch('/api/content/:id/collaborators/respond', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { accept } = req.body;

    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const collab = content.collaborators.find(
      c => c.user_id.toString() === userId && c.status === 'pending'
    );
    if (!collab) {
      return res.status(404).json({ error: 'No pending invitation' });
    }

    collab.status = accept ? 'accepted' : 'declined';
    await content.save();

    await CollabActivityLog.create({
      content_id: content._id,
      actor_id: userId,
      action: accept ? 'accept_invite' : 'decline_invite',
      target: userId.toString(),
      details: accept ? 'Accepted collaboration invite' : 'Declined collaboration invite'
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Respond collab error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change collaborator role
router.patch('/api/content/:id/collaborators/:collabUserId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { role } = req.body;

    const content = await Content.findOne({ _id: req.params.id, owner: userId });
    if (!content) {
      return res.status(404).json({ error: 'Content not found or not owner' });
    }

    const collab = content.collaborators.find(
      c => c.user_id.toString() === req.params.collabUserId
    );
    if (!collab) {
      return res.status(404).json({ error: 'Collaborator not found' });
    }

    collab.role = role;
    await content.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Change collab role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove collaborator
router.delete('/api/content/:id/collaborators/:collabUserId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Owner can remove anyone, collaborators can remove themselves
    const isOwner = content.owner.toString() === userId;
    const isSelf = req.params.collabUserId === userId;

    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    content.collaborators = content.collaborators.filter(
      c => c.user_id.toString() !== req.params.collabUserId
    );
    await content.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Remove collab error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get collab activity log
router.get('/api/content/:id/activity', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const isOwner = content.owner.toString() === userId;
    const isCollab = content.collaborators.some(
      c => c.user_id.toString() === userId && c.status === 'accepted'
    );
    if (!isOwner && !isCollab) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await CollabActivityLog.find({ content_id: content._id })
      .populate('actor_id', 'username')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
