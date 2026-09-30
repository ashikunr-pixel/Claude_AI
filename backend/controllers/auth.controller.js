const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const mongoService = require('../services/mongo.service');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.query('SELECT user_id FROM dbo.users WHERE email = @email', { email: cleanEmail });
    if (existing.recordset.length > 0) {
      return res.status(409).json({ success: false, error: 'A user with this email address already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default to 'USER' role unless explicitly created by an admin or first user
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';

    const insertRes = await db.query(
      `INSERT INTO dbo.users (name, email, password_hash, role, created_at)
       VALUES (@name, @email, @passwordHash, @role, SYSUTCDATETIME());
       SELECT SCOPE_IDENTITY() AS user_id;`,
      {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: userRole
      }
    );

    const userId = insertRes.recordset[0].user_id;
    const userObj = { user_id: userId, name: name.trim(), email: cleanEmail, role: userRole };
    const token = generateToken(userObj);

    await logger.audit(userId, 'USER_REGISTER', 'USER', userId, { email: cleanEmail, role: userRole });
    
    // Sync to MongoDB if connected
    mongoService.syncUser({
      userId,
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: userRole
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: userObj
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    const userRes = await db.query(
      'SELECT user_id, name, email, password_hash, role FROM dbo.users WHERE email = @email',
      { email: cleanEmail }
    );

    if (userRes.recordset.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const user = userRes.recordset[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const userObj = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = generateToken(userObj);
    await logger.audit(user.user_id, 'USER_LOGIN', 'USER', user.user_id);

    res.json({
      success: true,
      message: 'Authentication successful.',
      token,
      user: userObj
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const userRes = await db.query(
      'SELECT user_id, name, email, role, created_at FROM dbo.users WHERE user_id = @userId',
      { userId: req.user.user_id }
    );

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    res.json({
      success: true,
      user: userRes.recordset[0]
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  getMe
};
