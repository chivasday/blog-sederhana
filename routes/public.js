const express = require('express');
const db = require('../config/db');
const markdown = require('../utils/markdown');
const helpers = require('../utils/helpers');
const RSS = require('rss');
const router = express.Router();

// Homepage
router.get('/', async (req, res) => {
  try {
    const { q, category, page = 1 } = req.query;
    const limit = 12;
    const offset = (page - 1) * limit;
    
    let sql = `SELECT p.*, GROUP_CONCAT(t.name) as tag_names 
               FROM posts p 
               LEFT JOIN post_tags pt ON p.id = pt.post_id 
               LEFT JOIN tags t ON pt.tag_id = t.id 
               WHERE p.status = 'published'`;
    const params = [];
    
    if (category && category !== 'all') {
      sql += ' AND p.category = ?';
      params.push(category);
    }
    
    if (q) {
      sql += ' AND (p.title LIKE ? OR p.content LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    
    sql += ' GROUP BY p.id ORDER BY p.is_featured DESC, p.published_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [posts] = await db.query(sql, params);
    
    // Featured posts (pinned)
    const [featured] = await db.query(
      `SELECT * FROM posts WHERE status='published' AND is_featured=1 ORDER BY published_at DESC LIMIT 3`
    );
    
    // Popular tags
    const [popularTags] = await db.query(`
      SELECT t.name, t.slug, COUNT(pt.post_id) as count 
      FROM tags t 
      JOIN post_tags pt ON t.id = pt.tag_id 
      JOIN posts p ON pt.post_id = p.id 
      WHERE p.status = 'published' 
      GROUP BY t.id 
      ORDER BY count DESC 
      LIMIT 15
    `);
    
    // Categories
    const [categories] = await db.query(`
      SELECT category, COUNT(*) as count 
      FROM posts 
      WHERE status='published' 
      GROUP BY category
    `);
    
    // Site settings
    const [settings] = await db.query('SELECT * FROM settings');
    const site = {};
    settings.forEach(s => site[s.key] = s.value);
    
    const enriched = posts.map(p => ({
      ...p,
      tags: p.tag_names ? p.tag_names.split(',') : [],
      excerpt: p.excerpt || markdown.stripMarkdown(p.content).substring(0, 150),
      readTime: helpers.readingTime(p.content),
      thumbnail: helpers.getThumbnail(p),
      formattedDate: helpers.formatDate(p.published_at || p.created_at)
    }));
    
    res.render('public/home', {
      posts: enriched,
      featured: featured.map(p => ({ ...p, thumbnail: helpers.getThumbnail(p) })),
      popularTags,
      categories,
      site,
      currentCategory: category || 'all',
      searchQuery: q || '',
      currentPage: parseInt(page)
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// Single post
router.get('/post/:slug', async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT p.*, u.username as author_name 
       FROM posts p 
       LEFT JOIN users u ON p.author_id = u.id 
       WHERE p.slug = ? AND p.status IN ('published', 'private')`,
      [req.params.slug]
    );
    
    if (posts.length === 0) return res.status(404).render('404');
    
    const post = posts[0];
    
    // Block private posts jika bukan admin
    if (post.status === 'private' && !req.session.user) {
      return res.status(404).render('404');
    }
    
    // Track view
    const ip = req.ip;
    await db.query('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);
    await db.query('INSERT INTO post_views (post_id, ip_address) VALUES (?, ?)', [post.id, ip]);
    
    // Get tags
    const [tags] = await db.query(`
      SELECT t.* FROM tags t 
      JOIN post_tags pt ON t.id = pt.tag_id 
      WHERE pt.post_id = ?
    `, [post.id]);
    
    // Comments
    const [comments] = await db.query(
      'SELECT * FROM comments WHERE post_id = ? AND is_approved = 1 AND parent_id IS NULL ORDER BY created_at DESC',
      [post.id]
    );
    
    // Replies
    for (let c of comments) {
      const [replies] = await db.query(
        'SELECT * FROM comments WHERE parent_id = ? AND is_approved = 1 ORDER BY created_at ASC',
        [c.id]
      );
      c.replies = replies;
    }
    
    // Related
    const [related] = await db.query(
      `SELECT * FROM posts WHERE category = ? AND id != ? AND status = 'published' LIMIT 3`,
      [post.category, post.id]
    );
    
    // Settings
    const [settings] = await db.query('SELECT * FROM settings');
    const site = {};
    settings.forEach(s => site[s.key] = s.value);
    
    res.render('public/post', {
      post,
      tags,
      comments,
      related: related.map(p => ({ ...p, thumbnail: helpers.getThumbnail(p) })),
      renderedContent: markdown.render(post.content),
      readTime: helpers.readingTime(post.content),
      thumbnail: helpers.getThumbnail(post),
      videoType: post.video_type,
      youtubeId: post.video_type === 'youtube' ? helpers.getYoutubeId(post.video_url) : null,
      site,
      formattedDate: helpers.formatDate(post.published_at || post.created_at),
      shareUrl: `${site.site_url}/post/${post.slug}`
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// Post comment
router.post('/post/:slug/comment', async (req, res) => {
  try {
    const { name, email, content, parent_id } = req.body;
    const [posts] = await db.query('SELECT id FROM posts WHERE slug = ?', [req.params.slug]);
    if (posts.length === 0) return res.redirect('/');
    
    await db.query(
      'INSERT INTO comments (post_id, name, email, content, parent_id) VALUES (?, ?, ?, ?, ?)',
      [posts[0].id, name, email, content, parent_id || null]
    );
    
    res.redirect(`/post/${req.params.slug}#comments`);
  } catch (e) {
    console.error(e);
    res.redirect('/');
  }
});

// Tag filter
router.get('/tag/:slug', async (req, res) => {
  try {
    const [tags] = await db.query('SELECT * FROM tags WHERE slug = ?', [req.params.slug]);
    if (tags.length === 0) return res.status(404).render('404');
    
    const [posts] = await db.query(`
      SELECT p.* FROM posts p 
      JOIN post_tags pt ON p.id = pt.post_id 
      WHERE pt.tag_id = ? AND p.status = 'published' 
      ORDER BY p.published_at DESC
    `, [tags[0].id]);
    
    const [settings] = await db.query('SELECT * FROM settings');
    const site = {};
    settings.forEach(s => site[s.key] = s.value);
    
    const enriched = posts.map(p => ({
      ...p,
      excerpt: markdown.stripMarkdown(p.content).substring(0, 150),
      readTime: helpers.readingTime(p.content),
      thumbnail: helpers.getThumbnail(p),
      formattedDate: helpers.formatDate(p.published_at || p.created_at)
    }));
    
    res.render('public/tag', { posts: enriched, tag: tags[0], site });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// RSS feed
router.get('/rss.xml', async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings');
    const site = {};
    settings.forEach(s => site[s.key] = s.value);
    
    const feed = new RSS({
      title: site.site_title,
      description: site.site_description,
      feed_url: `${site.site_url}/rss.xml`,
      site_url: site.site_url,
      language: 'id'
    });
    
    const [posts] = await db.query(
      `SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 20`
    );
    
    posts.forEach(p => {
      feed.item({
        title: p.title,
        description: p.excerpt || markdown.stripMarkdown(p.content).substring(0, 300),
        url: `${site.site_url}/post/${p.slug}`,
        date: p.published_at || p.created_at,
        categories: [p.category]
      });
    });
    
    res.set('Content-Type', 'application/rss+xml');
    res.send(feed.xml({ indent: true }));
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
});

// Sitemap
router.get('/sitemap.xml', async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings');
    const site = {};
    settings.forEach(s => site[s.key] = s.value);
    
    const [posts] = await db.query(`SELECT slug, updated_at FROM posts WHERE status='published'`);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `<url><loc>${site.site_url}</loc></url>\n`;
    posts.forEach(p => {
      xml += `<url><loc>${site.site_url}/post/${p.slug}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod></url>\n`;
    });
    xml += `</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    res.status(500).send('Error');
  }
});

// Theme toggle
router.post('/theme', (req, res) => {
  const { theme } = req.body;
  res.cookie('theme', theme, { maxAge: 1000 * 60 * 60 * 24 * 365 });
  res.json({ success: true });
});

module.exports = router;
