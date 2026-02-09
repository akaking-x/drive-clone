const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/auth');
const Content = require('../models/Content');
const VideoPost = require('../models/VideoPost');
const User = require('../models/User');
const Follow = require('../models/Follow');
const AdminExportLog = require('../models/AdminExportLog');
const { generateExcelExport } = require('../services/excel-export');

// Admin content dashboard page
router.get('/admin-content', isAdmin, (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-content.html'));
});

// Get stats overview
router.get('/api/admin-content/stats', isAdmin, async (req, res) => {
  try {
    const [totalUsers, totalContent, totalPosts, totalFollows] = await Promise.all([
      User.countDocuments(),
      Content.countDocuments(),
      VideoPost.countDocuments(),
      Follow.countDocuments({ status: 'accepted' })
    ]);

    const statusCounts = await VideoPost.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const topUsers = await Content.aggregate([
      { $group: { _id: '$owner', contentCount: { $sum: 1 }, totalPosts: { $sum: '$post_count' } } },
      { $sort: { totalPosts: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { username: '$user.username', contentCount: 1, totalPosts: 1 } }
    ]);

    const recentPosts = await VideoPost.find()
      .populate('content_id', 'content_name')
      .populate('owner', 'username')
      .sort({ createdAt: -1 })
      .limit(10);

    const categoryCounts = await Content.aggregate([
      { $match: { category: { $ne: '' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalContent,
        totalPosts,
        totalFollows,
        statusCounts: statusCounts.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {}),
        topUsers,
        recentPosts,
        categoryCounts
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all content (admin view)
router.get('/api/admin-content/content', isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, userId } = req.query;
    const query = {};
    if (search) query.content_name = { $regex: search, $options: 'i' };
    if (category) query.category = category;
    if (userId) query.owner = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [contents, total] = await Promise.all([
      Content.find(query)
        .populate('owner', 'username')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Content.countDocuments(query)
    ]);

    res.json({
      success: true,
      contents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all posts (admin view)
router.get('/api/admin-content/posts', isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, contentId, userId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (contentId) query.content_id = contentId;
    if (userId) query.owner = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [posts, total] = await Promise.all([
      VideoPost.find(query)
        .populate('content_id', 'content_name')
        .populate('owner', 'username')
        .populate('uploaded_by', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      VideoPost.countDocuments(query)
    ]);

    res.json({
      success: true,
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users for admin content
router.get('/api/admin-content/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('username isAdmin storageUsed storageLimit createdAt lastLogin');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export Excel
router.get('/api/admin-content/export', isAdmin, async (req, res) => {
  try {
    const { userId, category, status, contentId } = req.query;
    const filters = {};
    if (userId) filters.userId = userId;
    if (category) filters.category = category;
    if (status) filters.status = status;
    if (contentId) filters.contentId = contentId;

    const workbook = await generateExcelExport(filters);

    // Log export
    await AdminExportLog.create({
      admin_id: req.session.userId,
      export_type: Object.keys(filters).length ? 'filtered' : 'all_content',
      filters
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="content-export-${Date.now()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed: ' + error.message });
  }
});

module.exports = router;
