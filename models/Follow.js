const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  requester_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  target_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  },
  cooldown_until: {
    type: Date,
    default: null
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

followSchema.index({ requester_id: 1, target_id: 1 }, { unique: true });
followSchema.index({ target_id: 1, status: 1 });

module.exports = mongoose.model('Follow', followSchema);
