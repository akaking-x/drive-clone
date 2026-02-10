const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const User = require('../models/User');
const S3Config = require('../models/S3Config');
const File = require('../models/File');
const Folder = require('../models/Folder');
const Content = require('../models/Content');
const VideoPost = require('../models/VideoPost');
const { isAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const { deleteFile, deletePrefix, copyObject, listObjects, isS3Configured } = require('../services/s3');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// Delete user (enhanced: delete all user data from S3 + DB)
router.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'Cannot delete admin user' });
    }

    const userId = user._id;
    let s3Deleted = 0;

    // Delete all S3 objects under user's prefix
    if (isS3Configured() && user.s3Prefix) {
      try {
        s3Deleted = await deletePrefix(user.s3Prefix + '/');
      } catch (err) {
        console.error('S3 cleanup error for user:', err);
      }
    }

    // Delete all DB records
    await File.deleteMany({ owner: userId });
    await Folder.deleteMany({ owner: userId });
    await Content.deleteMany({ owner: userId });
    await VideoPost.deleteMany({ owner: userId });

    // Remove user from vault groups
    const VaultGroup = require('../models/VaultGroup');
    await VaultGroup.updateMany(
      { 'members.user_id': userId },
      { $pull: { members: { user_id: userId } } }
    );

    // Remove user from vault credential sharing
    const VaultCredential = require('../models/VaultCredential');
    await VaultCredential.updateMany(
      { shared_with_users: userId },
      { $pull: { shared_with_users: userId } }
    );

    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: `User deleted. ${s3Deleted} S3 objects removed.` });
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

// Rename user
router.patch('/api/admin/users/:id/rename', isAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isAdmin) return res.status(400).json({ error: 'Cannot rename admin user' });

    // Check if new username is taken
    const existing = await User.findOne({ username: username.toLowerCase(), _id: { $ne: user._id } });
    if (existing) return res.status(400).json({ error: 'Username already taken' });

    user.username = username.toLowerCase();
    await user.save();

    res.json({ success: true, user: { _id: user._id, username: user.username } });
  } catch (error) {
    console.error('Rename user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle user active/inactive
router.patch('/api/admin/users/:id/toggle-active', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isAdmin) return res.status(400).json({ error: 'Cannot deactivate admin user' });

    user.isActive = !user.isActive;
    await user.save();

    res.json({ success: true, isActive: user.isActive });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Migrate all user data to another user
router.post('/api/admin/users/:id/migrate', isAdmin, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'Target user ID is required' });

    const sourceUser = await User.findById(req.params.id);
    if (!sourceUser) return res.status(404).json({ error: 'Source user not found' });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    if (sourceUser._id.toString() === targetUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot migrate to same user' });
    }

    const sourceId = sourceUser._id;
    const targetId = targetUser._id;
    let s3Migrated = 0;

    // Migrate S3 files: copy each file to target prefix, update DB keys
    if (isS3Configured() && sourceUser.s3Prefix && targetUser.s3Prefix) {
      const files = await File.find({ owner: sourceId });
      for (const file of files) {
        const newKey = file.s3Key.replace(sourceUser.s3Prefix, targetUser.s3Prefix);
        try {
          await copyObject(file.s3Key, newKey);
          await deleteFile(file.s3Key);
          file.s3Key = newKey;
          file.owner = targetId;
          await file.save();
          s3Migrated++;
        } catch (err) {
          console.error(`Failed to migrate file ${file.s3Key}:`, err);
        }
      }

      // Migrate video post S3 files
      const posts = await VideoPost.find({ owner: sourceId });
      for (const post of posts) {
        const migrateField = async (field) => {
          if (field && field.s3Key) {
            const newKey = field.s3Key.replace(sourceUser.s3Prefix, targetUser.s3Prefix);
            try {
              await copyObject(field.s3Key, newKey);
              await deleteFile(field.s3Key);
              field.s3Key = newKey;
              s3Migrated++;
            } catch (err) {
              console.error(`Failed to migrate S3 key ${field.s3Key}:`, err);
            }
          }
        };
        await migrateField(post.video);
        await migrateField(post.thumbnail);
        await migrateField(post.text_file);
        post.owner = targetId;
        await post.save();
      }
    } else {
      // No S3, just reassign ownership
      await File.updateMany({ owner: sourceId }, { owner: targetId });
      await VideoPost.updateMany({ owner: sourceId }, { owner: targetId });
    }

    // Migrate DB records
    await Folder.updateMany({ owner: sourceId }, { owner: targetId });
    await Content.updateMany({ owner: sourceId }, { owner: targetId });

    // Update storage used
    const totalSize = await File.aggregate([
      { $match: { owner: targetId } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]);
    targetUser.storageUsed = totalSize[0]?.total || 0;
    await targetUser.save();

    sourceUser.storageUsed = 0;
    await sourceUser.save();

    res.json({
      success: true,
      message: `Migrated data to ${targetUser.username}. ${s3Migrated} S3 objects moved.`
    });
  } catch (error) {
    console.error('Migrate user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download XLSX template for bulk user creation
router.get('/api/admin/users/template', isAdmin, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.columns = [
      { header: 'username', key: 'username', width: 25 },
      { header: 'password', key: 'password', width: 25 },
      { header: 'storage_limit_gb', key: 'storage_limit_gb', width: 18 }
    ];
    // Add example row
    sheet.addRow({ username: 'example_user', password: 'password123', storage_limit_gb: 5 });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=user_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Template download error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk upload users from XLSX
router.post('/api/admin/users/bulk-upload', isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    if (!sheet) return res.status(400).json({ error: 'No worksheet found' });

    const results = { created: [], updated: [], errors: [] };

    // Skip header row
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const username = (row.getCell(1).value || '').toString().trim().toLowerCase();
      const password = (row.getCell(2).value || '').toString().trim();
      const storageLimitGb = parseFloat(row.getCell(3).value) || 5;

      if (!username) continue;

      try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
          // Update existing user
          if (password) {
            existingUser.password = password;
          }
          existingUser.storageLimit = storageLimitGb * 1024 * 1024 * 1024;
          await existingUser.save();
          results.updated.push(username);
        } else {
          // Create new user
          const userPassword = password || User.generatePassword(12);
          const user = new User({
            username,
            password: userPassword,
            s3Prefix: `users/${uuidv4()}`,
            storageLimit: storageLimitGb * 1024 * 1024 * 1024
          });
          await user.save();
          results.created.push({ username, password: userPassword });
        }
      } catch (err) {
        results.errors.push({ username, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
