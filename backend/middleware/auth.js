const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'claude-ai-platform-super-secret-jwt-key-2026-antigravity';

/**
 * Authentication middleware to verify JWT token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. No token provided.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired session token. Please log in again.'
      });
    }

    req.user = decodedUser;
    next();
  });
}

/**
 * Role-based authorization middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.'
    });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Administrator privileges required.'
    });
  }

  next();
}

/**
 * Helper to generate JWT token for user
 */
function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken,
  JWT_SECRET
};
