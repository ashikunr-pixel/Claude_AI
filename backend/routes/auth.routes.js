const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
