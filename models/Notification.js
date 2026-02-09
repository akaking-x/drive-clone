const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['follow_request', 'follow_accepted', 'collab_invite', 'collab_activity', 'post_upload', 'general'],
    required: true
  },
  from_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  message: {
    type: String,
    required: true
  },
  reference_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  reference_type: {
    type: String,
    enum: ['content', 'post', 'follow', 'user']
  },
  is_read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationSchema.index({ user_id: 1, is_read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
