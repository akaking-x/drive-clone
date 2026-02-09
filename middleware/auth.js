// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.isAdmin) {
    return next();
  }
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return res.redirect('/login');
};

// Redirect if already logged in
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/drive');
  }
  return next();
};

module.exports = {
  isAuthenticated,
  isAdmin,
  redirectIfAuthenticated
};
