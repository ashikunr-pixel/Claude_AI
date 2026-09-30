const bcrypt = require('bcryptjs');
const { User, getNextSequence } = require('../models');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists in MongoDB Atlas
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A user with this email address already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
    const userId = await getNextSequence('userId');

    await User.create({
      user_id: userId,
      name: name.trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      role: userRole,
      created_at: new Date()
    });

    const userObj = { user_id: userId, name: name.trim(), email: cleanEmail, role: userRole };
    const token = generateToken(userObj);

    logger.audit(userId, 'USER_REGISTER', 'USER', userId, { email: cleanEmail, role: userRole }).catch(() => {});

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

    const user = await User.findOne({ email: cleanEmail }).lean();
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
    const user = await User.findOne({ user_id: req.user.user_id }, '-password_hash').lean();
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
