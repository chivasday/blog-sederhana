exports.requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/admin/login');
  }
  next();
};

exports.redirectIfAuth = (req, res, next) => {
  if (req.session.user) return res.redirect('/admin');
  next();
};

exports.injectUser = (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
};
