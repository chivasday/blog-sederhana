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

// Setup marked dengan syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true,
  gfm: true
});

// Setup Express
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Helper
function getPosts() {
  if (!fs.existsSync(POSTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
}

function savePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Convert markdown ke HTML yang aman
function renderMarkdown(text) {
  const html = marked.parse(text);
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['class'],
    ADD_TAGS: ['code', 'pre']
  });
}

// Routes
app.get('/', (req, res) => {
  const posts = getPosts();
  res.render('index', { posts });
});

app.get('/new', (req, res) => {
  res.render('new', { post: null });
});

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
  res.redirect('/post/' + newPost.id);
});

app.get('/post/:id', (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).send('Post tidak ditemukan');
  
  const renderedContent = renderMarkdown(post.content);
  res.render('post', { post, renderedContent });
});

app.get('/edit/:id', (req, res) => {
  const posts = getPosts();
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).send('Post tidak ditemukan');
  res.render('new', { post });
});

app.post('/edit/:id', (req, res) => {
  const posts = getPosts();
  const index = posts.findIndex(p => p.id == req.params.id);
  if (index === -1) return res.status(404).send('Post tidak ditemukan');
  
  posts[index].title = req.body.title;
  posts[index].content = req.body.content;
  posts[index].date = new Date().toLocaleString('id-ID') + ' (edited)';
  savePosts(posts);
  res.redirect('/post/' + req.params.id);
});

app.post('/delete/:id', (req, res) => {
  let posts = getPosts();
  posts = posts.filter(p => p.id != req.params.id);
  savePosts(posts);
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Blog jalan di http://localhost:${PORT}`);
});
