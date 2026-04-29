const express = require('express');
const db = require('../config/db');
const multer = require('multer');
const sharp = require('sharp');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const helpers = require('../utils/helpers');
const markdown = require('../utils/markdown');
const router = express.Router();

// Upload config
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ========== DASHBOARD ==========
router.get('/', requireAuth, async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM posts WHERE status='published') as published,
        (SELECT COUNT(*) FROM posts WHERE status='draft') as drafts,
        (SELECT COUNT(*) FROM posts WHERE status='private') as privates,
        (SELECT SUM(views) FROM posts) as total_views,
        (SELECT COUNT(*) FROM comments) as total_comments
    `);
    
    // Top posts
    const [topPosts] = await db.query(
      `SELECT id, title, slug, views FROM posts WHERE status='published' ORDER BY views DESC LIMIT 5`
    );
    
    // Recent posts
    const [recentPosts] = await db.query(
      `SELECT id, title, slug, status, views, created_at FROM posts ORDER BY created_at DESC LIMIT 5`
    );
    
    // Views last 7 days
    const [viewsChart] = await db.query(`
      SELECT DATE(viewed_at) as date, COUNT(*) as count 
      FROM post_views 
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
      GROUP BY DATE(viewed_at) 
      ORDER BY date ASC
    `);
    
    res.render('admin/dashboard', { stats, topPosts, recentPosts, viewsChart });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// ========== POSTS LIST ==========
router.get('/posts', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM posts';
    const params = [];
    
    if (status && status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC';
    const [posts] = await db.query(sql, params);
    
    res.render('admin/posts', { posts, currentStatus: status || 'all', helpers });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// ========== NEW POST ==========
router.get('/posts/new', requireAuth, (req, res) => {
  res.render('admin/post-editor', { post: null, tags: [] });
});

router.post('/posts/new', requireAuth, async (req, res) => {
  try {
    const { title, content, category, thumbnail, video_url, status, is_featured, 
            tags, meta_title, meta_description, meta_keywords, excerpt } = req.body;
    
    const slug = helpers.makeSlug(title) + '-' + Date.now().toString(36);
    const video_type = helpers.detectVideoType(video_url);
    const published_at = status === 'published' ? new Date() : null;
    
    const [result] = await db.query(`
      INSERT INTO posts 
      (title, slug, content, excerpt, category, thumbnail, video_url, video_type, 
       status, is_featured, meta_title, meta_description, meta_keywords, 
       author_id, published_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, slug, content, excerpt || markdown.stripMarkdown(content).substring(0, 200), 
        category, thumbnail, video_url, video_type, status, is_featured ? 1 : 0,
        meta_title, meta_description, meta_keywords, req.session.user.id, published_at]);
    
    const postId = result.insertId;
    
    // Handle tags
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tagName of tagList) {
        const tagSlug = helpers.makeSlug(tagName);
        await db.query('INSERT IGNORE INTO tags (name, slug) VALUES (?, ?)', [tagName, tagSlug]);
        const [tag] = await db.query('SELECT id FROM tags WHERE slug = ?', [tagSlug]);
        await db.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tag[0].id]);
      }
    }
    
    res.redirect('/admin/posts');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error: ' + e.message);
  }
});

// ========== EDIT POST ==========
router.get('/posts/edit/:id', requireAuth, async (req, res) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (posts.length === 0) return res.status(404).send('Not found');
    
    const [tags] = await db.query(`
      SELECT t.name FROM tags t 
      JOIN post_tags pt ON t.id = pt.tag_id 
      WHERE pt.post_id = ?
    `, [req.params.id]);
    
    const post = posts[0];
    post.tagsString = tags.map(t => t.name).join(', ');
    
    res.render('admin/post-editor', { post, tags });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

router.post('/posts/edit/:id', requireAuth, async (req, res) => {
  try {
    const { title, content, category, thumbnail, video_url, status, is_featured,
            tags, meta_title, meta_description, meta_keywords, excerpt } = req.body;
    
    const video_type = helpers.detectVideoType(video_url);
    
    // Cek apakah perlu set published_at
    const [current] = await db.query('SELECT status, published_at FROM posts WHERE id = ?', [req.params.id]);
    let published_at = current[0].published_at;
    if (status === 'published' && !published_at) {
      published_at = new Date();
    }
    
    await db.query(`
      UPDATE posts SET 
        title=?, content=?, excerpt=?, category=?, thumbnail=?, video_url=?, video_type=?,
        status=?, is_featured=?, meta_title=?, meta_description=?, meta_keywords=?, published_at=?
      WHERE id=?
    `, [title, content, excerpt || markdown.stripMarkdown(content).substring(0, 200), 
        category, thumbnail, video_url, video_type, status, is_featured ? 1 : 0,
        meta_title, meta_description, meta_keywords, published_at, req.params.id]);
    
    // Update tags - hapus dulu, tambah ulang
    await db.query('DELETE FROM post_tags WHERE post_id = ?', [req.params.id]);
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tagName of tagList) {
        const tagSlug = helpers.makeSlug(tagName);
        await db.query('INSERT IGNORE INTO tags (name, slug) VALUES (?, ?)', [tagName, tagSlug]);
        const [tag] = await db.query('SELECT id FROM tags WHERE slug = ?', [tagSlug]);
        await db.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [req.params.id, tag[0].id]);
      }
    }
    
    res.redirect('/admin/posts');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error: ' + e.message);
  }
});

// Quick status change
router.post('/posts/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const published_at = status === 'published' ? new Date() : null;
    await db.query('UPDATE posts SET status = ?, published_at = COALESCE(published_at, ?) WHERE id = ?', 
      [status, published_at, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle feature
router.post('/posts/:id/feature', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE posts SET is_featured = NOT is_featured WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete post
router.post('/posts/:id/delete', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.redirect('/admin/posts');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// ========== UPLOAD IMAGE ==========
router.post('/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;
    const filepath = path.join(uploadDir, filename);
    
    await sharp(req.file.buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(filepath);
    
    res.json({ url: `/uploads/${filename}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Upload from URL (remote GAS)
router.post('/upload-url', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    
    const buffer = await response.buffer();
    const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webp`;
    const filepath = path.join(uploadDir, filename);
    
    await sharp(buffer)
      .resize(1200, null, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(filepath);
    
    res.json({ url: `/uploads/${filename}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ========== COMMENTS ==========
router.get('/comments', requireAuth, async (req, res) => {
  try {
    const [comments] = await db.query(`
      SELECT c.*, p.title as post_title, p.slug as post_slug 
      FROM comments c 
      JOIN posts p ON c.post_id = p.id 
      ORDER BY c.created_at DESC
    `);
    res.render('admin/comments', { comments });
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.post('/comments/:id/delete', requireAuth, async (req, res) => {
  await db.query('DELETE FROM comments WHERE id = ?', [req.params.id]);
  res.redirect('/admin/comments');
});

router.post('/comments/:id/approve', requireAuth, async (req, res) => {
  await db.query('UPDATE comments SET is_approved = NOT is_approved WHERE id = ?', [req.params.id]);
  res.redirect('/admin/comments');
});

// ========== SETTINGS ==========
router.get('/settings', requireAuth, async (req, res) => {
  const [settings] = await db.query('SELECT * FROM settings');
  const site = {};
  settings.forEach(s => site[s.key] = s.value);
  res.render('admin/settings', { site });
});

router.post('/settings', requireAuth, async (req, res) => {
  const { site_title, site_description, site_url, admin_email } = req.body;
  const updates = { site_title, site_description, site_url, admin_email };
  
  for (const [key, value] of Object.entries(updates)) {
    await db.query('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      [key, value, value]);
  }
  
  res.redirect('/admin/settings');
});

module.exports = router;
