const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const mongoService = require('../services/mongo.service');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Default to 'USER' role unless explicitly created by an admin or first user
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let userId;
    try {
      // Check if user already exists
      const existing = await db.query('SELECT user_id FROM dbo.users WHERE email = @email', { email: cleanEmail });
      if (existing.recordset.length > 0) {
        return res.status(409).json({ success: false, error: 'A user with this email address already exists.' });
      }

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
      userId = insertRes.recordset[0].user_id;
    } catch (sqlErr) {
      // Fallback to MongoDB
      const { User, getNextSequence } = require('../models');
      const existingMongo = await User.findOne({ email: cleanEmail });
      if (existingMongo) {
        return res.status(409).json({ success: false, error: 'A user with this email address already exists.' });
      }
      userId = await getNextSequence('userId');
      await User.create({
        user_id: userId,
        name: name.trim(),
        email: cleanEmail,
        password_hash: passwordHash,
        role: userRole
      });
    }

    const userObj = { user_id: userId, name: name.trim(), email: cleanEmail, role: userRole };
    const token = generateToken(userObj);

    logger.audit(userId, 'USER_REGISTER', 'USER', userId, { email: cleanEmail, role: userRole }).catch(() => {});
    
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
    let user = null;

    try {
      const userRes = await db.query(
        'SELECT user_id, name, email, password_hash, role FROM dbo.users WHERE email = @email',
        { email: cleanEmail }
      );
      if (userRes.recordset.length > 0) {
        user = userRes.recordset[0];
      }
    } catch (sqlErr) {
      const { User } = require('../models');
      const mUser = await User.findOne({ email: cleanEmail });
      if (mUser) {
        user = {
          user_id: mUser.user_id,
          name: mUser.name,
          email: mUser.email,
          password_hash: mUser.password_hash,
          role: mUser.role
        };
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

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
    logger.audit(user.user_id, 'USER_LOGIN', 'USER', user.user_id).catch(() => {});

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
    let user = null;
    try {
      const userRes = await db.query(
        'SELECT user_id, name, email, role, created_at FROM dbo.users WHERE user_id = @userId',
        { userId: req.user.user_id }
      );
      if (userRes.recordset.length > 0) {
        user = userRes.recordset[0];
      }
    } catch (sqlErr) {
      const { User } = require('../models');
      const mUser = await User.findOne({ user_id: req.user.user_id });
      if (mUser) {
        user = {
          user_id: mUser.user_id,
          name: mUser.name,
          email: mUser.email,
          role: mUser.role,
          created_at: mUser.created_at
        };
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    res.json({
      success: true,
      user
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
