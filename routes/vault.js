const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const VaultCredential = require('../models/VaultCredential');
const VaultService = require('../models/VaultService');
const VaultGroup = require('../models/VaultGroup');

// Vault page
router.get('/vault', isAuthenticated, (req, res) => {
  res.sendFile('vault.html', { root: './public' });
});

// Get credentials shared with me (via user or group)
router.get('/api/vault/credentials', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    // Find groups the user belongs to
    const groups = await VaultGroup.find({ 'members.user_id': userId }, '_id');
    const groupIds = groups.map(g => g._id);

    // Find credentials shared with user directly or via groups
    const credentials = await VaultCredential.find({
      $or: [
        { shared_with_users: userId },
        { shared_with_groups: { $in: groupIds } }
      ]
    })
    .populate('service_id', 'name icon guide_text')
    .select('-credentials.password')
    .sort({ 'service_id.name': 1, label: 1 });

    res.json(credentials);
  } catch (error) {
    console.error('Get vault credentials error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decrypt & return password (access-checked)
router.get('/api/vault/credentials/:id/password', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const credential = await VaultCredential.findById(req.params.id);

    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check access: shared with user directly or via group
    const groups = await VaultGroup.find({ 'members.user_id': userId }, '_id');
    const groupIds = groups.map(g => g._id.toString());

    const hasDirectAccess = credential.shared_with_users.some(u => u.toString() === userId.toString());
    const hasGroupAccess = credential.shared_with_groups.some(g => groupIds.includes(g.toString()));
    const isAdmin = req.session.isAdmin;

    if (!hasDirectAccess && !hasGroupAccess && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const password = VaultCredential.decrypt(credential.credentials.password);
    res.json({ password });
  } catch (error) {
    console.error('Get vault password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Report error on a credential
router.post('/api/vault/credentials/:id/report', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { message } = req.body;

    const credential = await VaultCredential.findById(req.params.id);
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    // Check access
    const groups = await VaultGroup.find({ 'members.user_id': userId }, '_id');
    const groupIds = groups.map(g => g._id.toString());
    const hasAccess = credential.shared_with_users.some(u => u.toString() === userId.toString()) ||
                      credential.shared_with_groups.some(g => groupIds.includes(g.toString()));

    if (!hasAccess && !req.session.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    credential.error_reports.push({
      reported_by: userId,
      message: message || 'Credential not working'
    });
    credential.status = 'error';
    await credential.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Report vault error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List services with guides
router.get('/api/vault/services', isAuthenticated, async (req, res) => {
  try {
    const services = await VaultService.find().sort({ name: 1 });
    res.json(services);
  } catch (error) {
    console.error('Get vault services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
