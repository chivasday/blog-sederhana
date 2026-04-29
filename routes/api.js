const express = require('express');
const db = require('../config/db');
const router = express.Router();

// Search API (buat autocomplete)
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  
  const [posts] = await db.query(
    `SELECT id, title, slug FROM posts WHERE status='published' AND title LIKE ? LIMIT 10`,
    [`%${q}%`]
  );
  res.json(posts);
});

module.exports = router;
