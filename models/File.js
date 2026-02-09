const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    default: 'application/octet-stream'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  isDeleted: {
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
  },
  lastAccessedAt: {
    type: Date,
    default: null
  }
});

// Index for faster queries
fileSchema.index({ owner: 1, folder: 1, isDeleted: 1 });
fileSchema.index({ s3Key: 1 });
fileSchema.index({ owner: 1, lastAccessedAt: -1 }); // For recent files

module.exports = mongoose.model('File', fileSchema);
