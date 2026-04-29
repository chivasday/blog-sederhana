const bcrypt = require('bcrypt');
const db = require('./config/db');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

(async () => {
  try {
    const username = await ask('Username admin: ');
    const email = await ask('Email: ');
    const password = await ask('Password: ');
    
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
      [username, hash, email, 'admin']
    );
    
    console.log('✅ Admin berhasil dibuat!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
})();
