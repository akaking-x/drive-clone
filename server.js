require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const fileRoutes = require('./routes/files');
const contentRoutes = require('./routes/content');
const videoPostRoutes = require('./routes/video-posts');
const followRoutes = require('./routes/follows');
const notificationRoutes = require('./routes/notifications');
const adminContentRoutes = require('./routes/admin-content');
const vaultRoutes = require('./routes/vault');
const vaultAdminRoutes = require('./routes/vault-admin');
const { initS3Client } = require('./services/s3');
const User = require('./models/User');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 6666;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Trust proxy for Cloudflare tunnel
app.set('trust proxy', 1);

// Session configuration - 30 days persistence
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'drive-clone-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/drive-clone',
    ttl: 30 * 24 * 60 * 60, // 30 days in seconds
    autoRemove: 'native',
    touchAfter: 24 * 3600 // Only update session once per 24 hours unless data changes
  }),
  cookie: {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    sameSite: 'lax'
  }
};

// Enable secure cookies when behind HTTPS proxy (Cloudflare)
if (process.env.NODE_ENV === 'production') {
  sessionConfig.cookie.secure = true;
  sessionConfig.cookie.sameSite = 'none';
}

app.use(session(sessionConfig));

// Routes
app.use(authRoutes);
app.use(adminRoutes);
app.use(fileRoutes);
app.use(contentRoutes);
app.use(videoPostRoutes);
app.use(followRoutes);
app.use(notificationRoutes);
app.use(adminContentRoutes);
app.use(vaultRoutes);
app.use(vaultAdminRoutes);

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/drive');
  }
  res.redirect('/login');
});

// Drive page
app.get('/drive', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'drive.html'));
});

// Content Manager page
app.get('/content-manager', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'content-manager.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/drive-clone');
    console.log('Connected to MongoDB');

    // Create admin user if not exists
    const adminExists = await User.findOne({ isAdmin: true });
    if (!adminExists) {
      const adminUser = new User({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123456',
        isAdmin: true,
        s3Prefix: `admin/${uuidv4()}`
      });
      await adminUser.save();
      console.log('Admin user created');
      console.log(`  Username: ${adminUser.username}`);
      console.log(`  Password: ${process.env.ADMIN_PASSWORD || 'admin123456'}`);
    }

    // Initialize S3 client
    await initS3Client();

    // Start server with extended timeout for large uploads
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('========================================');
      console.log('  Drive Clone Server Started');
      console.log('========================================');
      console.log(`  Local:    http://localhost:${PORT}`);
      console.log(`  Network:  http://0.0.0.0:${PORT}`);
      console.log(`  Max upload: 3GB`);
      console.log('========================================');
      console.log('');
    });

    // Increase timeout for large file uploads (30 minutes)
    server.timeout = 30 * 60 * 1000;
    server.keepAliveTimeout = 30 * 60 * 1000;
    server.headersTimeout = 31 * 60 * 1000;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
