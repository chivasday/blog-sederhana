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
// TAMBAHIN DI routes/auth.js - HAPUS SETELAH PAKAI!
const bcrypt = require('bcrypt');
const db = require('../config/db');

router.get('/setup-first-admin-xyz123', async (req, res) => {
  try {
    // Cek kalau udah ada user, tolak
    const [existing] = await db.query('SELECT COUNT(*) as count FROM users');
    if (existing[0].count > 0) {
      return res.send('❌ Admin sudah ada. Route ini di-disable.');
    }
    
    const username = 'admin';
    const password = 'Ayani170';  // GANTI NANTI!
    const email = 'admin@televisodes.com';
    
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
      [username, hash, email, 'admin']
    );
    
    res.send(`
      <h1>✅ Admin Created!</h1>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Password:</strong> ${password}</p>
      <p style="color:red;"><strong>⚠️ PENTING:</strong></p>
      <ol>
        <li>Login dulu di <a href="/admin/login">/admin/login</a></li>
        <li>Ganti password via Settings</li>
        <li>HAPUS route ini dari code & redeploy!</li>
      </ol>
    `);
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

module.exports = router;
