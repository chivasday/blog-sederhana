const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { redirectIfAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/login', redirectIfAuth, (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.render('admin/login', { error: 'Username tidak ditemukan' });
    }
    
    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (!match) {
      return res.render('admin/login', { error: 'Password salah' });
    }
    
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    res.redirect('/admin');
  } catch (e) {
    console.error(e);
    res.render('admin/login', { error: 'Terjadi error' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
