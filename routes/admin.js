const express = require('express');
const router = express.Router();
const User = require('../models/User');
const S3Config = require('../models/S3Config');
const { isAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Admin page
router.get('/admin', isAdmin, (req, res) => {
  res.sendFile('admin.html', { root: './public' });
});

// Get S3 config
router.get('/api/admin/s3-config', isAdmin, async (req, res) => {
  try {
    const config = await S3Config.getActiveConfig();
    if (!config) {
      return res.json({ configured: false });
    }
    res.json({
      configured: true,
      config: {
        endpoint: config.endpoint,
        bucket: config.bucket,
        region: config.region,
        providerName: config.providerName,
        forcePathStyle: config.forcePathStyle
      }
    });
  } catch (error) {
    console.error('Get S3 config error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save S3 config
router.post('/api/admin/s3-config', isAdmin, async (req, res) => {
  try {
    const { endpoint, accessKey, secretKey, bucket, region, forcePathStyle, providerName } = req.body;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Deactivate old config
    await S3Config.updateMany({}, { isActive: false });

    // Create new config
    const config = new S3Config({
      endpoint,
      accessKey,
      secretKey,
      bucket,
      region: region || 'us-east-1',
      forcePathStyle: forcePathStyle !== false,
      providerName: providerName || 'Custom S3',
      isActive: true
    });

    await config.save();

    // Reinitialize S3 client
    const { initS3Client } = require('../services/s3');
    await initS3Client();

    res.json({ success: true, message: 'S3 configuration saved' });
  } catch (error) {
    console.error('Save S3 config error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users
router.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new user
router.post('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const { username, storageLimit } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Check if username exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Generate random password
    const password = User.generatePassword(12);

    // Create unique S3 prefix for this user
    const s3Prefix = `users/${uuidv4()}`;

    const user = new User({
      username: username.toLowerCase(),
      password,
      s3Prefix,
      storageLimit: storageLimit || 5368709120 // 5GB default
    });

    await user.save();

    res.json({
      success: true,
      user: {
        username: user.username,
        password: password, // Return plain password only once
        s3Prefix: user.s3Prefix,
        storageLimit: user.storageLimit
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user
router.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'Cannot delete admin user' });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset user password
router.post('/api/admin/users/:id/reset-password', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newPassword = User.generatePassword(12);
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      password: newPassword
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user storage limit
router.patch('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const { storageLimit } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { storageLimit },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change admin password
router.post('/api/admin/change-password', isAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
