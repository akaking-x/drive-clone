const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/auth');
const VaultService = require('../models/VaultService');
const VaultGroup = require('../models/VaultGroup');
const VaultCredential = require('../models/VaultCredential');
const User = require('../models/User');

// Admin vault page
router.get('/admin-vault', isAdmin, (req, res) => {
  res.sendFile('admin-vault.html', { root: './public' });
});

// ========== Services CRUD ==========

router.get('/api/admin/vault/services', isAdmin, async (req, res) => {
  try {
    const services = await VaultService.find().sort({ name: 1 });
    res.json(services);
  } catch (error) {
    console.error('Get vault services error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/vault/services', isAdmin, async (req, res) => {
  try {
    const { name, icon, guide_text } = req.body;
    if (!name) return res.status(400).json({ error: 'Service name is required' });

    const service = new VaultService({
      name,
      icon: icon || '',
      guide_text: guide_text || '',
      created_by: req.session.userId
    });
    await service.save();
    res.json({ success: true, service });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Service name already exists' });
    console.error('Create vault service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/admin/vault/services/:id', isAdmin, async (req, res) => {
  try {
    const { name, icon, guide_text } = req.body;
    const service = await VaultService.findByIdAndUpdate(
      req.params.id,
      { name, icon, guide_text },
      { new: true, runValidators: true }
    );
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true, service });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Service name already exists' });
    console.error('Update vault service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/admin/vault/services/:id', isAdmin, async (req, res) => {
  try {
    // Check if any credentials use this service
    const count = await VaultCredential.countDocuments({ service_id: req.params.id });
    if (count > 0) {
      return res.status(400).json({ error: `Cannot delete: ${count} credential(s) use this service` });
    }
    const service = await VaultService.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vault service error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Groups CRUD ==========

router.get('/api/admin/vault/groups', isAdmin, async (req, res) => {
  try {
    const groups = await VaultGroup.find()
      .populate('members.user_id', 'username')
      .sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    console.error('Get vault groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/vault/groups', isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const group = new VaultGroup({
      name,
      description: description || '',
      created_by: req.session.userId
    });
    await group.save();
    res.json({ success: true, group });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Group name already exists' });
    console.error('Create vault group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/admin/vault/groups/:id', isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const group = await VaultGroup.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true }
    );
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true, group });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Group name already exists' });
    console.error('Update vault group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/admin/vault/groups/:id', isAdmin, async (req, res) => {
  try {
    // Remove group from all credentials' shared_with_groups
    await VaultCredential.updateMany(
      { shared_with_groups: req.params.id },
      { $pull: { shared_with_groups: req.params.id } }
    );
    const group = await VaultGroup.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vault group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add member to group
router.post('/api/admin/vault/groups/:id/members', isAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID is required' });

    const group = await VaultGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if already a member
    if (group.members.some(m => m.user_id.toString() === user_id)) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    group.members.push({ user_id });
    await group.save();

    const updated = await VaultGroup.findById(req.params.id).populate('members.user_id', 'username');
    res.json({ success: true, group: updated });
  } catch (error) {
    console.error('Add group member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove member from group
router.delete('/api/admin/vault/groups/:id/members/:userId', isAdmin, async (req, res) => {
  try {
    const group = await VaultGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter(m => m.user_id.toString() !== req.params.userId);
    await group.save();

    const updated = await VaultGroup.findById(req.params.id).populate('members.user_id', 'username');
    res.json({ success: true, group: updated });
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== Credentials CRUD ==========

router.get('/api/admin/vault/credentials', isAdmin, async (req, res) => {
  try {
    const credentials = await VaultCredential.find()
      .populate('service_id', 'name icon')
      .populate('shared_with_users', 'username')
      .populate('shared_with_groups', 'name')
      .populate('error_reports.reported_by', 'username')
      .sort({ createdAt: -1 });
    res.json(credentials);
  } catch (error) {
    console.error('Get vault credentials error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/vault/credentials', isAdmin, async (req, res) => {
  try {
    const { service_id, label, username, password, extra_fields, shared_with_users, shared_with_groups, notes } = req.body;

    if (!service_id || !label) {
      return res.status(400).json({ error: 'Service and label are required' });
    }

    const encryptedPassword = VaultCredential.encrypt(password || '');

    const credential = new VaultCredential({
      service_id,
      label,
      credentials: {
        username: username || '',
        password: encryptedPassword,
        extra_fields: extra_fields || []
      },
      shared_with_users: shared_with_users || [],
      shared_with_groups: shared_with_groups || [],
      notes: notes || '',
      created_by: req.session.userId
    });

    await credential.save();

    const populated = await VaultCredential.findById(credential._id)
      .populate('service_id', 'name icon')
      .populate('shared_with_users', 'username')
      .populate('shared_with_groups', 'name');

    res.json({ success: true, credential: populated });
  } catch (error) {
    console.error('Create vault credential error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/admin/vault/credentials/:id', isAdmin, async (req, res) => {
  try {
    const { service_id, label, username, password, extra_fields, shared_with_users, shared_with_groups, notes, status } = req.body;

    const credential = await VaultCredential.findById(req.params.id);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });

    if (service_id) credential.service_id = service_id;
    if (label) credential.label = label;
    if (username !== undefined) credential.credentials.username = username;
    if (password !== undefined) {
      credential.credentials.password = VaultCredential.encrypt(password);
    }
    if (extra_fields !== undefined) credential.credentials.extra_fields = extra_fields;
    if (shared_with_users !== undefined) credential.shared_with_users = shared_with_users;
    if (shared_with_groups !== undefined) credential.shared_with_groups = shared_with_groups;
    if (notes !== undefined) credential.notes = notes;
    if (status) credential.status = status;

    await credential.save();

    const populated = await VaultCredential.findById(credential._id)
      .populate('service_id', 'name icon')
      .populate('shared_with_users', 'username')
      .populate('shared_with_groups', 'name')
      .populate('error_reports.reported_by', 'username');

    res.json({ success: true, credential: populated });
  } catch (error) {
    console.error('Update vault credential error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/admin/vault/credentials/:id', isAdmin, async (req, res) => {
  try {
    const credential = await VaultCredential.findByIdAndDelete(req.params.id);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete vault credential error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve error report
router.patch('/api/admin/vault/credentials/:id/resolve-error/:idx', isAdmin, async (req, res) => {
  try {
    const credential = await VaultCredential.findById(req.params.id);
    if (!credential) return res.status(404).json({ error: 'Credential not found' });

    const idx = parseInt(req.params.idx);
    if (idx < 0 || idx >= credential.error_reports.length) {
      return res.status(400).json({ error: 'Invalid error report index' });
    }

    credential.error_reports[idx].resolved = true;

    // If all errors resolved, set status back to active
    const hasUnresolved = credential.error_reports.some(r => !r.resolved);
    if (!hasUnresolved) {
      credential.status = 'active';
    }

    await credential.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Resolve vault error report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get users list for sharing picker
router.get('/api/admin/vault/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false }, 'username isActive').sort({ username: 1 });
    res.json(users);
  } catch (error) {
    console.error('Get vault users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
