const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { marked } = require('marked');
const hljs = require('highlight.js');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_FILE = './posts.json';

// Kategori tersedia
const CATEGORIES = ['Tutorial', 'Script', 'Tips & Trick', 'AI Prompt', 'Review', 'Lainnya'];

// Setup marked
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true,
  gfm: true
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Helpers
function getPosts() {
  if (!fs.existsSync(POSTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function renderMarkdown(text) {
  const html = marked.parse(text);
  return DOMPurify.sanitize(html, { ADD_ATTR: ['class'], ADD_TAGS: ['code', 'pre'] });
}

// Strip markdown buat excerpt
function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>\$\$()]/g, '')
    .replace(/!\$.*?\$\$.*?\$/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// Estimasi waktu baca
function readingTime(text) {
  const words = stripMarkdown(text).split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Generate thumbnail otomatis kalau kosong
function getThumbnail(post) {
  if (post.thumbnail && post.thumbnail.trim()) return post.thumbnail;
  // Auto thumbnail pake placeholder dengan warna random berdasarkan category
  const colors = {
    'Tutorial': '4F46E5',
    'Script': '059669',
    'Tips & Trick': 'DC2626',
    'AI Prompt': '7C3AED',
    'Review': 'EA580C',
    'Lainnya': '6B7280'
  };
  const color = colors[post.category] || '6B7280';
  const text = encodeURIComponent(post.title.substring(0, 30));
  return `https://placehold.co/600x300/${color}/white?text=${text}`;
}

// ============ ROUTES ============

// Homepage dengan search & filter
app.get('/', (req, res) => {
  let posts = getPosts();
  const { q, category } = req.query;

  // Filter by category
  if (category && category !== 'all') {
    posts = posts.filter(p => p.category === category);
  }

  // Search
  if (q) {
    const query = q.toLowerCase();
    posts = posts.filter(p => 
      p.title.toLowerCase().includes(query) ||
      p.content.toLowerCase().includes(query) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  // Enrich data
  const enriched = posts.map(p => ({
    ...p,
    excerpt: stripMarkdown(p.content).substring(0, 150),
    readTime: readingTime(p.content),
    thumbnail: getThumbnail(p)
  }));

  res.render('index', { 
    posts: enriched, 
    categories: CATEGORIES,
    currentCategory: category || 'all',
    searchQuery: q || ''
  });
});

// Form post baru
app.get('/new', (req, res) => {
  res.render('new', { post: null, categories: CATEGORIES });
});

// Simpan post baru
app.post('/new', (req, res) => {
  const posts = getPosts();
  const newPost = {
    id: Date.now(),
    title: req.body.title,
    category: req.body.category || 'Lainnya',
    tags: req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    thumbnail: req.body.thumbnail || '',
    content: req.body.content,
    views: 0,
    date: new Date().toLocaleString('id-ID')
  };
  posts.unshift(newPost);
  savePosts(posts);
  res.redirect('/post/' + newPost.id);
});

// Detail post
app.get('/post/:id', (req, res) => {
  const posts = getPosts();
  const postIndex = posts.findIndex(p => p.id == req.params.id);
  if (postIndex === -1) return res.status(404).send('Post tidak ditemukan');
  
  // Increment views
  posts[postIndex].views = (posts[postIndex].views || 0) + 1;
  savePosts(posts);
  
  const post = posts[postIndex];
  const renderedContent = renderMarkdown(post.content);
  const readTime = readingTime(post.content);
  const thumbnail = getThumbnail(post);
  
  // Related posts (same category, exclude current)
  const related = posts
    .filter(p => p.category === post.category && p.id !== post.id)
    .slice(0, 3)
    .map(p => ({ ...p, thumbnail: getThumbnail(p) }));
  
  res.render('post', { post, renderedContent, readTime, thumbnail, related });
});

// Edit
app.get('/edit/:id', (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).send('Post tidak ditemukan');
  res.render('new', { post, categories: CATEGORIES });
});

app.post('/edit/:id', (req, res) => {
  const posts = getPosts();
  const index = posts.findIndex(p => p.id == req.params.id);
  if (index === -1) return res.status(404).send('Post tidak ditemukan');
  
  posts[index].title = req.body.title;
  posts[index].category = req.body.category || 'Lainnya';
  posts[index].tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  posts[index].thumbnail = req.body.thumbnail || '';
  posts[index].content = req.body.content;
  posts[index].date = new Date().toLocaleString('id-ID') + ' (edited)';
  savePosts(posts);
  res.redirect('/post/' + req.params.id);
});

// Delete
app.post('/delete/:id', (req, res) => {
  let posts = getPosts();
  posts = posts.filter(p => p.id != req.params.id);
  savePosts(posts);
  res.redirect('/');
});

// Filter by tag
app.get('/tag/:tag', (req, res) => {
  const tag = req.params.tag.toLowerCase();
  const posts = getPosts()
    .filter(p => p.tags && p.tags.some(t => t.toLowerCase() === tag))
    .map(p => ({
      ...p,
      excerpt: stripMarkdown(p.content).substring(0, 150),
      readTime: readingTime(p.content),
      thumbnail: getThumbnail(p)
    }));
  
  res.render('index', { 
    posts, 
    categories: CATEGORIES,
    currentCategory: 'all',
    searchQuery: '',
    tagFilter: tag
  });
});

app.listen(PORT, () => {
  console.log(`Blog jalan di http://localhost:${PORT}`);
});
