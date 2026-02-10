const mongoose = require('mongoose');

const vaultGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  members: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    added_at: { type: Date, default: Date.now }
  }],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

vaultGroupSchema.index({ 'members.user_id': 1 });

vaultGroupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('VaultGroup', vaultGroupSchema);
