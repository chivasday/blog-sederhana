const { marked } = require('marked');
const hljs = require('highlight.js');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

marked.setOptions({
  highlight: (code, lang) => {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true,
  gfm: true
});

exports.render = (text) => {
  if (!text) return '';
  const html = marked.parse(text);
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['class', 'target'],
    ADD_TAGS: ['code', 'pre', 'iframe', 'video', 'source'],
    ALLOW_UNKNOWN_PROTOCOLS: false
  });
};

exports.stripMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>\$\$()]/g, '')
    .replace(/!\$.*?\$\$.*?\$/g, '')
    .replace(/\n+/g, ' ')
    .trim();
};
