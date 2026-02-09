const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const Folder = require('../models/Folder');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');
const s3Service = require('../services/s3');

// Create temp upload directory
const uploadDir = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for disk storage (better for large files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 3 * 1024 * 1024 * 1024 // 3GB limit
  }
});

// Store for tracking chunked uploads
const chunkedUploads = new Map();

// Upload chunk - for large files
router.post('/api/files/upload-chunk', isAuthenticated, upload.single('chunk'), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No chunk uploaded' });
    }

    tempFilePath = req.file.path;
    const { chunkIndex, totalChunks, uploadId, fileName, fileSize } = req.body;

    console.log(`[Chunk] Received chunk ${parseInt(chunkIndex) + 1}/${totalChunks} for ${fileName}`);

    // Initialize upload tracking
    if (!chunkedUploads.has(uploadId)) {
      chunkedUploads.set(uploadId, {
        chunks: [],
        fileName,
        fileSize: parseInt(fileSize),
        totalChunks: parseInt(totalChunks),
        createdAt: Date.now()
      });
    }

    const uploadInfo = chunkedUploads.get(uploadId);
    uploadInfo.chunks[parseInt(chunkIndex)] = tempFilePath;

    res.json({ success: true, chunkIndex: parseInt(chunkIndex) });
  } catch (error) {
    console.error('Chunk upload error:', error);
    // Clean up on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
    res.status(500).json({ error: 'Chunk upload failed' });
  }
});

// Complete chunked upload - assemble chunks and upload to S3
router.post('/api/files/upload-complete', isAuthenticated, async (req, res) => {
  const { uploadId, fileName, fileSize, mimeType, folder } = req.body;
  let assembledFilePath = null;

  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const uploadInfo = chunkedUploads.get(uploadId);
    if (!uploadInfo) {
      return res.status(400).json({ error: 'Upload not found' });
    }

    const userId = req.session.userId;
    const s3Prefix = req.session.s3Prefix;
    const folderId = folder || null;

    // Check storage limit
    const user = await User.findById(userId);
    if (user.storageUsed + parseInt(fileSize) > user.storageLimit) {
      // Clean up chunks
      uploadInfo.chunks.forEach(chunkPath => {
        if (chunkPath && fs.existsSync(chunkPath)) {
          try { fs.unlinkSync(chunkPath); } catch (e) {}
        }
      });
      chunkedUploads.delete(uploadId);
      return res.status(400).json({ error: 'Storage limit exceeded' });
    }

    console.log(`[Upload] Assembling ${uploadInfo.chunks.length} chunks for ${fileName}`);

    // Assemble chunks into one file
    assembledFilePath = path.join(uploadDir, `assembled-${uploadId}`);
    const writeStream = fs.createWriteStream(assembledFilePath);

    for (let i = 0; i < uploadInfo.totalChunks; i++) {
      const chunkPath = uploadInfo.chunks[i];
      if (!chunkPath || !fs.existsSync(chunkPath)) {
        throw new Error(`Missing chunk ${i}`);
      }
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
      // Delete chunk after reading
      fs.unlinkSync(chunkPath);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`[Upload] Assembled file, uploading to S3...`);

    // Upload to S3
    const fileExt = fileName.split('.').pop();
    const s3Key = `${s3Prefix}/${uuidv4()}.${fileExt}`;
    const fileStream = fs.createReadStream(assembledFilePath);

    await s3Service.uploadFile(s3Key, fileStream, mimeType || 'application/octet-stream');

    // Clean up assembled file
    if (fs.existsSync(assembledFilePath)) {
      fs.unlinkSync(assembledFilePath);
    }

    // Save file record
    const file = new File({
      name: fileName,
      originalName: fileName,
      s3Key,
      size: parseInt(fileSize),
      mimeType: mimeType || 'application/octet-stream',
      owner: userId,
      folder: folderId
    });

    await file.save();

    // Update user storage
    await User.findByIdAndUpdate(userId, {
      $inc: { storageUsed: parseInt(fileSize) }
    });

    // Clean up tracking
    chunkedUploads.delete(uploadId);

    console.log(`[Upload] Complete: ${fileName}`);
    res.json({ success: true, file });
  } catch (error) {
    console.error('Complete upload error:', error);
    // Clean up
    if (assembledFilePath && fs.existsSync(assembledFilePath)) {
      try { fs.unlinkSync(assembledFilePath); } catch (e) {}
    }
    if (chunkedUploads.has(uploadId)) {
      const uploadInfo = chunkedUploads.get(uploadId);
      uploadInfo.chunks.forEach(chunkPath => {
        if (chunkPath && fs.existsSync(chunkPath)) {
          try { fs.unlinkSync(chunkPath); } catch (e) {}
        }
      });
      chunkedUploads.delete(uploadId);
    }
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Clean up old incomplete uploads (run periodically)
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [uploadId, info] of chunkedUploads.entries()) {
    if (now - info.createdAt > maxAge) {
      console.log(`[Cleanup] Removing stale upload: ${uploadId}`);
      info.chunks.forEach(chunkPath => {
        if (chunkPath && fs.existsSync(chunkPath)) {
          try { fs.unlinkSync(chunkPath); } catch (e) {}
        }
      });
      chunkedUploads.delete(uploadId);
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Get storage info
router.get('/api/storage', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId, 'storageUsed storageLimit');
    res.json({
      used: user.storageUsed,
      limit: user.storageLimit,
      percentage: Math.round((user.storageUsed / user.storageLimit) * 100)
    });
  } catch (error) {
    console.error('Get storage error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recent files - MUST be before /:id routes
router.get('/api/files/recent', isAuthenticated, async (req, res) => {
  try {
    const files = await File.find({
      owner: req.session.userId,
      isDeleted: false,
      lastAccessedAt: { $ne: null }
    })
    .sort({ lastAccessedAt: -1 })
    .limit(50);

    res.json({ files });
  } catch (error) {
    console.error('Get recent files error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload file - MUST be before /:id routes
router.post('/api/files/upload', isAuthenticated, upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured. Please contact admin.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    tempFilePath = req.file.path;
    const userId = req.session.userId;
    const s3Prefix = req.session.s3Prefix;
    const folderId = req.body.folder || null;

    console.log('[Upload] File received:', req.file.originalname, 'Size:', req.file.size);

    // Check storage limit
    const user = await User.findById(userId);
    if (user.storageUsed + req.file.size > user.storageLimit) {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({ error: 'Storage limit exceeded' });
    }

    // Generate unique S3 key
    const fileExt = req.file.originalname.split('.').pop();
    const s3Key = `${s3Prefix}/${uuidv4()}.${fileExt}`;

    // Stream file to S3
    const fileStream = fs.createReadStream(tempFilePath);

    console.log('[Upload] Uploading to S3:', s3Key);

    await s3Service.uploadFile(
      s3Key,
      fileStream,
      req.file.mimetype
    );

    console.log('[Upload] S3 upload complete');

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Save file record to database
    const file = new File({
      name: req.file.originalname,
      originalName: req.file.originalname,
      s3Key,
      size: req.file.size,
      mimeType: req.file.mimetype,
      owner: userId,
      folder: folderId
    });

    await file.save();

    // Update user storage
    await User.findByIdAndUpdate(userId, {
      $inc: { storageUsed: req.file.size }
    });

    console.log('[Upload] Complete:', req.file.originalname);
    res.json({ success: true, file });
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('Failed to delete temp file:', e);
      }
    }
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get files and folders in a directory
router.get('/api/files', isAuthenticated, async (req, res) => {
  try {
    const folderId = req.query.folder || null;
    const userId = req.session.userId;

    console.log('[API] Get files - userId:', userId, 'folderId:', folderId);

    const [files, folders] = await Promise.all([
      File.find({
        owner: userId,
        folder: folderId,
        isDeleted: false
      }).sort({ createdAt: -1 }),
      Folder.find({
        owner: userId,
        parent: folderId,
        isDeleted: false
      }).sort({ name: 1 })
    ]);

    console.log('[API] Found files:', files.length, 'folders:', folders.length);

    // Get breadcrumb path
    let breadcrumbs = [];
    if (folderId) {
      let currentFolder = await Folder.findById(folderId);
      while (currentFolder) {
        breadcrumbs.unshift({
          id: currentFolder._id,
          name: currentFolder.name
        });
        currentFolder = currentFolder.parent ? await Folder.findById(currentFolder.parent) : null;
      }
    }

    res.json({
      files: files || [],
      folders: folders || [],
      breadcrumbs: breadcrumbs || [],
      currentFolder: folderId
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track file access (for recent files)
router.post('/api/files/:id/access', isAuthenticated, async (req, res) => {
  try {
    await File.findOneAndUpdate(
      { _id: req.params.id, owner: req.session.userId },
      { lastAccessedAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get file thumbnail (for images)
router.get('/api/files/:id/thumbnail', isAuthenticated, async (req, res) => {
  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const file = await File.findOne({
      _id: req.params.id,
      owner: req.session.userId,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Only allow image thumbnails
    if (!file.mimeType || !file.mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image file' });
    }

    // Get file stream from S3
    const fileStream = await s3Service.getFileStream(file.s3Key);

    // Set headers for inline display with caching
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', 'inline');

    fileStream.pipe(res);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

// Get file content (for text files preview)
router.get('/api/files/:id/content', isAuthenticated, async (req, res) => {
  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const file = await File.findOne({
      _id: req.params.id,
      owner: req.session.userId,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Limit content preview to 1MB
    if (file.size > 1024 * 1024) {
      return res.status(400).json({ error: 'File too large for preview' });
    }

    const textMimeTypes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
    const textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.css', '.html', '.xml', '.csv', '.log', '.ini', '.cfg', '.conf', '.sh', '.bat', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.sql', '.yml', '.yaml', '.env', '.gitignore'];

    const isTextMime = textMimeTypes.some(t => file.mimeType && file.mimeType.startsWith(t));
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    const isTextExt = textExtensions.includes(ext);

    if (!isTextMime && !isTextExt) {
      return res.status(400).json({ error: 'Not a text file' });
    }

    const fileStream = await s3Service.getFileStream(file.s3Key);

    const chunks = [];
    fileStream.on('data', chunk => chunks.push(chunk));
    fileStream.on('end', () => {
      const content = Buffer.concat(chunks).toString('utf-8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
    });
    fileStream.on('error', (err) => {
      console.error('Stream error:', err);
      res.status(500).json({ error: 'Failed to read file' });
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

// Download file
router.get('/api/files/:id/download', isAuthenticated, async (req, res) => {
  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const file = await File.findOne({
      _id: req.params.id,
      owner: req.session.userId,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileStream = await s3Service.getFileStream(file.s3Key);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', file.size);

    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get download URL
router.get('/api/files/:id/url', isAuthenticated, async (req, res) => {
  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const file = await File.findOne({
      _id: req.params.id,
      owner: req.session.userId,
      isDeleted: false
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const url = await s3Service.getDownloadUrl(file.s3Key, 3600);
    res.json({ url });
  } catch (error) {
    console.error('Get URL error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// Rename file
router.patch('/api/files/:id', isAuthenticated, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const file = await File.findOneAndUpdate(
      { _id: req.params.id, owner: req.session.userId },
      { name: name.trim(), updatedAt: new Date() },
      { new: true }
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ success: true, file });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({ error: 'Rename failed' });
  }
});

// Delete file
router.delete('/api/files/:id', isAuthenticated, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.id,
      owner: req.session.userId
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (s3Service.isS3Configured()) {
      try {
        await s3Service.deleteFile(file.s3Key);
      } catch (s3Error) {
        console.error('S3 delete error:', s3Error);
      }
    }

    await User.findByIdAndUpdate(req.session.userId, {
      $inc: { storageUsed: -file.size }
    });

    await File.findByIdAndDelete(file._id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Create folder
router.post('/api/folders', isAuthenticated, async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const userId = req.session.userId;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const existing = await Folder.findOne({
      owner: userId,
      parent: parentId || null,
      name: name.trim(),
      isDeleted: false
    });

    if (existing) {
      return res.status(400).json({ error: 'A folder with this name already exists' });
    }

    let path = '/';
    if (parentId) {
      const parent = await Folder.findById(parentId);
      if (parent) {
        path = `${parent.path}${parent.name}/`;
      }
    }

    const folder = new Folder({
      name: name.trim(),
      owner: userId,
      parent: parentId || null,
      path
    });

    await folder.save();

    res.json({ success: true, folder });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Rename folder
router.patch('/api/folders/:id', isAuthenticated, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const folder = await Folder.findOneAndUpdate(
      { _id: req.params.id, owner: req.session.userId },
      { name: name.trim(), updatedAt: new Date() },
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ success: true, folder });
  } catch (error) {
    console.error('Rename folder error:', error);
    res.status(500).json({ error: 'Rename failed' });
  }
});

// Delete folder
router.delete('/api/folders/:id', isAuthenticated, async (req, res) => {
  try {
    const folder = await Folder.findOne({
      _id: req.params.id,
      owner: req.session.userId
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const getAllFolderIds = async (folderId) => {
      const ids = [folderId];
      const subfolders = await Folder.find({ parent: folderId, owner: req.session.userId });
      for (const sub of subfolders) {
        const subIds = await getAllFolderIds(sub._id);
        ids.push(...subIds);
      }
      return ids;
    };

    const folderIds = await getAllFolderIds(folder._id);

    const files = await File.find({
      folder: { $in: folderIds },
      owner: req.session.userId
    });

    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      if (s3Service.isS3Configured()) {
        try {
          await s3Service.deleteFile(file.s3Key);
        } catch (s3Error) {
          console.error('S3 delete error:', s3Error);
        }
      }
    }

    await File.deleteMany({
      folder: { $in: folderIds },
      owner: req.session.userId
    });

    await Folder.deleteMany({
      _id: { $in: folderIds },
      owner: req.session.userId
    });

    if (totalSize > 0) {
      await User.findByIdAndUpdate(req.session.userId, {
        $inc: { storageUsed: -totalSize }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
