const mongoose = require('mongoose');

const videoPostSchema = new mongoose.Schema({
  content_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true
  },
  post_number: {
    type: Number,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Video file
  video: {
    s3Key: String,
    originalName: String,
    mimeType: String,
    size: Number
  },
  // Thumbnail
  thumbnail: {
    s3Key: String,
    originalName: String,
    mimeType: String,
    size: Number
  },
  // Text content
  text_content: {
    hook: { type: String, default: '' },
    caption: { type: String, default: '' },
    hashtags: { type: String, default: '' },
    raw_text: { type: String, default: '' },
    mode: { type: String, enum: ['structured', 'raw'], default: 'structured' }
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'hidden', 'done', 'posted'],
    default: 'draft'
  },
  status_history: [{
    from: String,
    to: String,
    changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changed_at: { type: Date, default: Date.now }
  }],
  notes: {
    type: String,
    default: ''
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

videoPostSchema.index({ content_id: 1, post_number: -1 });
videoPostSchema.index({ owner: 1, status: 1 });
videoPostSchema.index({ content_id: 1, status: 1 });

videoPostSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('VideoPost', videoPostSchema);
