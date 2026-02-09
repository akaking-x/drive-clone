const mongoose = require('mongoose');

const collabActivityLogSchema = new mongoose.Schema({
  content_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true
  },
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['invite', 'accept_invite', 'decline_invite', 'remove_collab', 'change_role',
           'upload_post', 'edit_post', 'delete_post', 'status_change', 'edit_content']
  },
  target: String,
  details: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

collabActivityLogSchema.index({ content_id: 1, createdAt: -1 });

module.exports = mongoose.model('CollabActivityLog', collabActivityLogSchema);
