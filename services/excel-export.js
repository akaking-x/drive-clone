const ExcelJS = require('exceljs');
const Content = require('../models/Content');
const VideoPost = require('../models/VideoPost');
const User = require('../models/User');
const Follow = require('../models/Follow');
const CollabActivityLog = require('../models/CollabActivityLog');

async function generateExcelExport(filters = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Drive Clone - Content Manager';
  workbook.created = new Date();

  // Sheet 1: Overview / Summary
  await buildSummarySheet(workbook, filters);

  // Sheet 2: All Content
  await buildContentSheet(workbook, filters);

  // Sheet 3: All Video Posts
  await buildPostsSheet(workbook, filters);

  // Sheet 4: Users & Follow Stats
  await buildUsersSheet(workbook);

  // Sheet 5: Activity Log
  await buildActivitySheet(workbook, filters);

  return workbook;
}

async function buildSummarySheet(workbook, filters) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 }
  ];

  const totalUsers = await User.countDocuments();
  const totalContent = await Content.countDocuments();
  const totalPosts = await VideoPost.countDocuments();
  const statusCounts = await VideoPost.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const rows = [
    { metric: 'Total Users', value: totalUsers },
    { metric: 'Total Content', value: totalContent },
    { metric: 'Total Video Posts', value: totalPosts },
    { metric: 'Total Follows', value: await Follow.countDocuments({ status: 'accepted' }) },
    { metric: '---', value: '---' },
    { metric: 'Export Date', value: new Date().toISOString() },
    { metric: 'Filters Applied', value: JSON.stringify(filters) || 'None' },
    { metric: '---', value: '---' }
  ];

  statusCounts.forEach(s => {
    rows.push({ metric: `Posts - ${s._id}`, value: s.count });
  });

  sheet.addRows(rows);
  styleHeader(sheet);
}

async function buildContentSheet(workbook, filters) {
  const sheet = workbook.addWorksheet('Content');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 25 },
    { header: 'Content Name', key: 'name', width: 30 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Platform Tags', key: 'tags', width: 25 },
    { header: 'Post Count', key: 'posts', width: 12 },
    { header: 'Collaborators', key: 'collabs', width: 15 },
    { header: 'Public', key: 'public', width: 10 },
    { header: 'Created', key: 'created', width: 20 },
    { header: 'Updated', key: 'updated', width: 20 }
  ];

  const query = {};
  if (filters.userId) query.owner = filters.userId;
  if (filters.category) query.category = filters.category;

  const contents = await Content.find(query)
    .populate('owner', 'username')
    .sort({ createdAt: -1 });

  contents.forEach(c => {
    sheet.addRow({
      id: c._id.toString(),
      name: c.content_name,
      owner: c.owner?.username || 'Unknown',
      category: c.category,
      tags: (c.platform_tags || []).join(', '),
      posts: c.post_count,
      collabs: (c.collaborators || []).filter(x => x.status === 'accepted').length,
      public: c.is_public ? 'Yes' : 'No',
      created: c.createdAt ? c.createdAt.toISOString() : '',
      updated: c.updatedAt ? c.updatedAt.toISOString() : ''
    });
  });

  styleHeader(sheet);
  return contents.length;
}

async function buildPostsSheet(workbook, filters) {
  const sheet = workbook.addWorksheet('Video Posts');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 25 },
    { header: 'Content Name', key: 'content', width: 25 },
    { header: 'Post #', key: 'number', width: 8 },
    { header: 'Owner', key: 'owner', width: 15 },
    { header: 'Uploaded By', key: 'uploader', width: 15 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Has Video', key: 'hasVideo', width: 10 },
    { header: 'Has Thumbnail', key: 'hasThumb', width: 12 },
    { header: 'Hook', key: 'hook', width: 30 },
    { header: 'Caption', key: 'caption', width: 30 },
    { header: 'Hashtags', key: 'hashtags', width: 25 },
    { header: 'Notes', key: 'notes', width: 20 },
    { header: 'Created', key: 'created', width: 20 }
  ];

  const query = {};
  if (filters.contentId) query.content_id = filters.contentId;
  if (filters.status) query.status = filters.status;

  const posts = await VideoPost.find(query)
    .populate('content_id', 'content_name')
    .populate('owner', 'username')
    .populate('uploaded_by', 'username')
    .sort({ createdAt: -1 });

  posts.forEach(p => {
    sheet.addRow({
      id: p._id.toString(),
      content: p.content_id?.content_name || 'Unknown',
      number: p.post_number,
      owner: p.owner?.username || 'Unknown',
      uploader: p.uploaded_by?.username || 'Unknown',
      status: p.status,
      hasVideo: p.video?.s3Key ? 'Yes' : 'No',
      hasThumb: p.thumbnail?.s3Key ? 'Yes' : 'No',
      hook: p.text_content?.hook || '',
      caption: p.text_content?.caption || '',
      hashtags: p.text_content?.hashtags || '',
      notes: p.notes || '',
      created: p.createdAt ? p.createdAt.toISOString() : ''
    });
  });

  styleHeader(sheet);
  return posts.length;
}

async function buildUsersSheet(workbook) {
  const sheet = workbook.addWorksheet('Users & Stats');
  sheet.columns = [
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Is Admin', key: 'isAdmin', width: 10 },
    { header: 'Content Count', key: 'contentCount', width: 15 },
    { header: 'Post Count', key: 'postCount', width: 12 },
    { header: 'Following', key: 'following', width: 12 },
    { header: 'Followers', key: 'followers', width: 12 },
    { header: 'Storage Used', key: 'storage', width: 15 },
    { header: 'Storage Limit', key: 'limit', width: 15 },
    { header: 'Last Login', key: 'lastLogin', width: 20 },
    { header: 'Created', key: 'created', width: 20 }
  ];

  const users = await User.find().select('-password').sort({ createdAt: -1 });

  for (const u of users) {
    const [contentCount, postCount, following, followers] = await Promise.all([
      Content.countDocuments({ owner: u._id }),
      VideoPost.countDocuments({ owner: u._id }),
      Follow.countDocuments({ requester_id: u._id, status: 'accepted' }),
      Follow.countDocuments({ target_id: u._id, status: 'accepted' })
    ]);

    sheet.addRow({
      username: u.username,
      isAdmin: u.isAdmin ? 'Yes' : 'No',
      contentCount,
      postCount,
      following,
      followers,
      storage: formatBytes(u.storageUsed),
      limit: formatBytes(u.storageLimit),
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : 'Never',
      created: u.createdAt ? u.createdAt.toISOString() : ''
    });
  }

  styleHeader(sheet);
}

async function buildActivitySheet(workbook, filters) {
  const sheet = workbook.addWorksheet('Activity Log');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Actor', key: 'actor', width: 15 },
    { header: 'Action', key: 'action', width: 15 },
    { header: 'Content', key: 'content', width: 25 },
    { header: 'Details', key: 'details', width: 40 }
  ];

  const query = {};
  if (filters.contentId) query.content_id = filters.contentId;

  const logs = await CollabActivityLog.find(query)
    .populate('actor_id', 'username')
    .populate('content_id', 'content_name')
    .sort({ createdAt: -1 })
    .limit(500);

  logs.forEach(l => {
    sheet.addRow({
      date: l.createdAt ? l.createdAt.toISOString() : '',
      actor: l.actor_id?.username || 'Unknown',
      action: l.action,
      content: l.content_id?.content_name || 'Unknown',
      details: l.details || ''
    });
  });

  styleHeader(sheet);
}

function styleHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4285F4' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount }
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { generateExcelExport };
