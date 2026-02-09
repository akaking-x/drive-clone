const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const VideoPost = require('../models/VideoPost');
const Content = require('../models/Content');
const User = require('../models/User');
const CollabActivityLog = require('../models/CollabActivityLog');
const { isAuthenticated } = require('../middleware/auth');
const s3Service = require('../services/s3');

// Multer config
const uploadDir = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB per file
});

const uploadFields = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Helper: check content access
async function checkContentAccess(contentId, userId, requireEdit = false) {
  const content = await Content.findById(contentId);
  if (!content) return { error: 'Content not found', status: 404 };

  const isOwner = content.owner.toString() === userId;
  const collab = content.collaborators.find(
    c => c.user_id.toString() === userId && c.status === 'accepted'
  );
  const isEditor = collab && collab.role === 'editor';
  const isViewer = collab && collab.role === 'viewer';

  if (!isOwner && !collab) {
    return { error: 'Access denied', status: 403 };
  }
  if (requireEdit && !isOwner && !isEditor) {
    return { error: 'Edit permission required', status: 403 };
  }

  return { content, isOwner, isEditor, isViewer };
}

// Get posts for a content
router.get('/api/video-posts', isAuthenticated, async (req, res) => {
  try {
    const { content_id, status, sort } = req.query;
    if (!content_id) {
      return res.status(400).json({ error: 'content_id required' });
    }

    const access = await checkContentAccess(content_id, req.session.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const query = { content_id };
    if (status) query.status = status;

    const sortOrder = sort === 'oldest' ? { post_number: 1 } : { post_number: -1 };

    const posts = await VideoPost.find(query)
      .populate('uploaded_by', 'username')
      .sort(sortOrder);

    res.json({ success: true, posts, access: { isOwner: access.isOwner, isEditor: access.isEditor } });
  } catch (error) {
    console.error('Get video posts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single post
router.get('/api/video-posts/:id', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id)
      .populate('uploaded_by', 'username')
      .populate('content_id', 'content_name owner');

    if (!post) return res.status(404).json({ error: 'Post not found' });

    const access = await checkContentAccess(post.content_id._id || post.content_id, req.session.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    res.json({ success: true, post, access: { isOwner: access.isOwner, isEditor: access.isEditor } });
  } catch (error) {
    console.error('Get post detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload new video post
router.post('/api/video-posts', isAuthenticated, (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large (max 500MB)' });
      }
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  const tempFiles = [];
  try {
    if (!s3Service.isS3Configured()) {
      return res.status(503).json({ error: 'Storage not configured' });
    }

    const { content_id, hook, caption, hashtags, raw_text, text_mode, notes } = req.body;
    if (!content_id) return res.status(400).json({ error: 'content_id required' });

    const access = await checkContentAccess(content_id, req.session.userId, true);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const userId = req.session.userId;
    let s3Prefix = req.session.s3Prefix;

    // Ensure s3Prefix exists
    if (!s3Prefix) {
      const user = await User.findById(userId);
      if (!user || !user.s3Prefix) {
        return res.status(500).json({ error: 'User storage prefix not configured' });
      }
      s3Prefix = user.s3Prefix;
      req.session.s3Prefix = s3Prefix;
    }

    // Get next post number
    const lastPost = await VideoPost.findOne({ content_id }).sort({ post_number: -1 });
    const postNumber = lastPost ? lastPost.post_number + 1 : 1;

    const s3Base = `${s3Prefix}/content/${content_id}/${postNumber}`;
    const postData = {
      content_id,
      post_number: postNumber,
      owner: access.content.owner,
      uploaded_by: userId,
      text_content: {
        hook: hook || '',
        caption: caption || '',
        hashtags: hashtags || '',
        raw_text: raw_text || '',
        mode: text_mode || 'structured'
      },
      notes: notes || '',
      status: 'draft'
    };

    // Upload video
    if (req.files && req.files.video && req.files.video[0]) {
      const videoFile = req.files.video[0];
      tempFiles.push(videoFile.path);
      const videoExt = path.extname(videoFile.originalname) || '.mp4';
      const videoKey = `${s3Base}/video${videoExt}`;
      const videoStream = fs.createReadStream(videoFile.path);
      await s3Service.uploadFile(videoKey, videoStream, videoFile.mimetype || 'video/mp4');

      postData.video = {
        s3Key: videoKey,
        originalName: videoFile.originalname,
        mimeType: videoFile.mimetype,
        size: videoFile.size
      };
    }

    // Upload thumbnail
    if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
      const thumbFile = req.files.thumbnail[0];
      tempFiles.push(thumbFile.path);
      const thumbExt = path.extname(thumbFile.originalname) || '.jpg';
      const thumbKey = `${s3Base}/thumbnail${thumbExt}`;
      const thumbStream = fs.createReadStream(thumbFile.path);
      await s3Service.uploadFile(thumbKey, thumbStream, thumbFile.mimetype || 'image/jpeg');

      postData.thumbnail = {
        s3Key: thumbKey,
        originalName: thumbFile.originalname,
        mimeType: thumbFile.mimetype,
        size: thumbFile.size
      };
    }

    const post = new VideoPost(postData);
    await post.save();

    // Update content post count
    await Content.findByIdAndUpdate(content_id, {
      $inc: { post_count: 1 },
      updatedAt: new Date()
    });

    // Update user storage
    let totalSize = 0;
    if (postData.video) totalSize += postData.video.size;
    if (postData.thumbnail) totalSize += postData.thumbnail.size;
    if (totalSize > 0) {
      await User.findByIdAndUpdate(access.content.owner, {
        $inc: { storageUsed: totalSize }
      });
    }

    // Log activity
    await CollabActivityLog.create({
      content_id,
      actor_id: userId,
      action: 'upload_post',
      target: post._id.toString(),
      details: `Uploaded post #${postNumber}`
    });

    // Cleanup temp files
    tempFiles.forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
    });

    await post.populate('uploaded_by', 'username');
    res.json({ success: true, post });
  } catch (error) {
    console.error('Upload video post error:', error);
    tempFiles.forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
    });
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Update post (text content, notes, status)
router.patch('/api/video-posts/:id', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const access = await checkContentAccess(post.content_id, req.session.userId, true);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const { hook, caption, hashtags, raw_text, text_mode, notes, status } = req.body;

    if (hook !== undefined) post.text_content.hook = hook;
    if (caption !== undefined) post.text_content.caption = caption;
    if (hashtags !== undefined) post.text_content.hashtags = hashtags;
    if (raw_text !== undefined) post.text_content.raw_text = raw_text;
    if (text_mode !== undefined) post.text_content.mode = text_mode;
    if (notes !== undefined) post.notes = notes;

    if (status && status !== post.status) {
      post.status_history.push({
        from: post.status,
        to: status,
        changed_by: req.session.userId
      });
      post.status = status;
    }

    await post.save();
    await post.populate('uploaded_by', 'username');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle post status (quick action)
router.patch('/api/video-posts/:id/status', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const access = await checkContentAccess(post.content_id, req.session.userId, true);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const { status } = req.body;
    if (!['draft', 'hidden', 'done', 'posted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const oldStatus = post.status;
    post.status_history.push({
      from: oldStatus,
      to: status,
      changed_by: req.session.userId
    });
    post.status = status;
    await post.save();

    res.json({ success: true, post: { _id: post._id, status: post.status } });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete post
router.delete('/api/video-posts/:id', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const access = await checkContentAccess(post.content_id, req.session.userId, true);
    if (access.error) return res.status(access.status).json({ error: access.error });

    let totalSize = 0;
    if (s3Service.isS3Configured()) {
      if (post.video && post.video.s3Key) {
        try { await s3Service.deleteFile(post.video.s3Key); } catch (e) {}
        totalSize += post.video.size || 0;
      }
      if (post.thumbnail && post.thumbnail.s3Key) {
        try { await s3Service.deleteFile(post.thumbnail.s3Key); } catch (e) {}
        totalSize += post.thumbnail.size || 0;
      }
    }

    await VideoPost.findByIdAndDelete(post._id);

    await Content.findByIdAndUpdate(post.content_id, {
      $inc: { post_count: -1 },
      updatedAt: new Date()
    });

    if (totalSize > 0) {
      await User.findByIdAndUpdate(post.owner, {
        $inc: { storageUsed: -totalSize }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stream video
router.get('/api/video-posts/:id/video', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id);
    if (!post || !post.video || !post.video.s3Key) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const access = await checkContentAccess(post.content_id, req.session.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const url = await s3Service.getDownloadUrl(post.video.s3Key, 3600);
    res.json({ url });
  } catch (error) {
    console.error('Stream video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stream thumbnail
router.get('/api/video-posts/:id/thumbnail', isAuthenticated, async (req, res) => {
  try {
    const post = await VideoPost.findById(req.params.id);
    if (!post || !post.thumbnail || !post.thumbnail.s3Key) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    const access = await checkContentAccess(post.content_id, req.session.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const stream = await s3Service.getFileStream(post.thumbnail.s3Key);
    res.setHeader('Content-Type', post.thumbnail.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  } catch (error) {
    console.error('Stream thumbnail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
