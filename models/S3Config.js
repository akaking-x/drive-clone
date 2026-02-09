const mongoose = require('mongoose');

const s3ConfigSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true
  },
  accessKey: {
    type: String,
    required: true
  },
  secretKey: {
    type: String,
    required: true
  },
  bucket: {
    type: String,
    required: true
  },
  region: {
    type: String,
    default: 'us-east-1'
  },
  forcePathStyle: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  providerName: {
    type: String,
    default: 'Custom S3'
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

// Only one active config at a time
s3ConfigSchema.statics.getActiveConfig = async function() {
  return await this.findOne({ isActive: true });
};

module.exports = mongoose.model('S3Config', s3ConfigSchema);
