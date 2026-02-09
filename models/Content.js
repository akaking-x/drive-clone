const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  content_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    trim: true,
    default: ''
  },
  platform_tags: [{
    type: String,
    trim: true
  }],
  reference_links: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    default: ''
  },
  // Collaboration
  collaborators: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
    added_at: { type: Date, default: Date.now },
    invited_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
  }],
  post_count: {
    type: Number,
    default: 0
  },
  is_public: {
    type: Boolean,
    default: false
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

contentSchema.index({ owner: 1, createdAt: -1 });
contentSchema.index({ 'collaborators.user_id': 1 });
contentSchema.index({ category: 1 });

contentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Content', contentSchema);
