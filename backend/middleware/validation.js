const { isValidEmail, isValidPassword } = require('../utils/validators');

function validateRegistration(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Full name must be at least 2 characters.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  if (!password || password.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Password cannot be empty.' });
  }

  next();
}

module.exports = {
  validateRegistration,
  validateLogin
};
