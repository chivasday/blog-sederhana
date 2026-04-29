const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { redirectIfAuth } = require('../middleware/auth');
const router = express.Router();

// ============ LOGIN ============
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
    let match = false;
    
    // Support both plain text & bcrypt hash (temporary)
    if (user.password.startsWith('$2')) {
      match = await bcrypt.compare(password, user.password);
    } else {
      match = (password === user.password);
      // Auto-upgrade ke bcrypt setelah login sukses
      if (match) {
        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
      }
    }
    
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
    res.render('admin/login', { error: 'Error: ' + e.message });
  }
});

// ============ SETUP ADMIN (TEMPORARY - HAPUS SETELAH DIPAKAI!) ============
router.get('/setup-xyz-123-secret', async (req, res) => {
  try {
    const [existing] = await db.query('SELECT COUNT(*) as count FROM users');
    
    if (existing[0].count > 0) {
      return res.send(`
        <h1>ℹ️ Admin sudah ada (${existing[0].count} user)</h1>
        <p><a href="/admin/login">Go to Login</a></p>
        <p>Reset password? <a href="/admin/setup-reset-xyz-123">Click here</a></p>
      `);
    }
    
    await db.query(
      'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin123', 'admin@televisodes.com', 'admin']
    );
    
    res.send(`
      <h1>✅ Admin Created!</h1>
      <p><strong>Username:</strong> admin</p>
      <p><strong>Password:</strong> admin123</p>
      <p><a href="/admin/login">→ LOGIN NOW</a></p>
      <p style="color:red;"><strong>⚠️ HAPUS route ini setelah login!</strong></p>
    `);
  } catch (e) {
    res.send('<pre>Error: ' + e.message + '</pre>');
  }
});

// ============ RESET PASSWORD (TEMPORARY) ============
router.get('/setup-reset-xyz-123', async (req, res) => {
  try {
    await db.query("UPDATE users SET password = 'admin123' WHERE username = 'admin'");
    res.send(`
      <h1>🔄 Password Reset!</h1>
      <p><strong>Username:</strong> admin</p>
      <p><strong>Password:</strong> admin123</p>
      <p><a href="/admin/login">→ LOGIN NOW</a></p>
    `);
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

// ============ LOGOUT ============
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
