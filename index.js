const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_FILE = './posts.json';

// Setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Helper baca/tulis posts
function getPosts() {
  if (!fs.existsSync(POSTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Halaman utama - list semua post
app.get('/', (req, res) => {
  const posts = getPosts();
  res.render('index', { posts });
});

// Form buat post baru
app.get('/new', (req, res) => {
  res.render('new');
});

// Simpan post baru
app.post('/new', (req, res) => {
  const posts = getPosts();
  const newPost = {
    id: Date.now(),
    title: req.body.title,
    content: req.body.content,
    date: new Date().toLocaleString('id-ID')
  };
  posts.unshift(newPost);
  savePosts(posts);
  res.redirect('/');
});

// Lihat detail post
app.get('/post/:id', (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).send('Post tidak ditemukan');
  res.render('post', { post });
});

// Hapus post
app.post('/delete/:id', (req, res) => {
  let posts = getPosts();
  posts = posts.filter(p => p.id != req.params.id);
  savePosts(posts);
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Blog jalan di http://localhost:${PORT}`);
});
