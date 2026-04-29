const slugify = require('slugify');

exports.makeSlug = (text) => slugify(text, { lower: true, strict: true });

exports.readingTime = (text) => {
  const words = text.replace(/[#*`_~]/g, '').split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
};

exports.formatDate = (date) => {
  return new Date(date).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

exports.detectVideoType = (url) => {
  if (!url) return 'none';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('.m3u8')) return 'hls';
  if (url.match(/\.(mp4|webm|ogg)$/i)) return 'mp4';
  return 'none';
};

exports.getYoutubeId = (url) => {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
};

exports.getThumbnail = (post) => {
  if (post.thumbnail) return post.thumbnail;
  const colors = {
    'Tutorial': '4F46E5', 'Script': '059669', 'Tips & Trick': 'DC2626',
    'AI Prompt': '7C3AED', 'Review': 'EA580C', 'Lainnya': '6B7280'
  };
  const color = colors[post.category] || '6B7280';
  const text = encodeURIComponent((post.title || '').substring(0, 30));
  return `https://placehold.co/600x300/${color}/white?text=${text}`;
};
