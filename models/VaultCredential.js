const mongoose = require('mongoose');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) throw new Error('VAULT_ENCRYPTION_KEY not set in environment');
  return crypto.scryptSync(key, 'vault-salt', 32);
}

function encrypt(text) {
  if (!text) return { encrypted: '', iv: '', tag: '' };
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), tag };
}

function decrypt(data) {
  if (!data || !data.encrypted) return '';
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const vaultCredentialSchema = new mongoose.Schema({
  service_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VaultService',
    required: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  credentials: {
    username: { type: String, default: '' },
    password: {
      encrypted: { type: String, default: '' },
      iv: { type: String, default: '' },
      tag: { type: String, default: '' }
    },
    extra_fields: [{
      key: { type: String, required: true },
      value: { type: String, default: '' }
    }]
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error'],
    default: 'active'
  },
  error_reports: [{
    reported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, default: '' },
    resolved: { type: Boolean, default: false },
    reported_at: { type: Date, default: Date.now }
  }],
  shared_with_users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  shared_with_groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VaultGroup' }],
  notes: {
    type: String,
    default: ''
  },
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

vaultCredentialSchema.index({ service_id: 1 });
vaultCredentialSchema.index({ shared_with_users: 1 });
vaultCredentialSchema.index({ shared_with_groups: 1 });

vaultCredentialSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

vaultCredentialSchema.statics.encrypt = encrypt;
vaultCredentialSchema.statics.decrypt = decrypt;

module.exports = mongoose.model('VaultCredential', vaultCredentialSchema);
