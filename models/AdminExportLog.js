const mongoose = require('mongoose');

const adminExportLogSchema = new mongoose.Schema({
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  export_type: {
    type: String,
    enum: ['all_content', 'user_content', 'filtered'],
    required: true
  },
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  row_count: {
    type: Number,
    default: 0
  },
  file_size: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AdminExportLog', adminExportLogSchema);
