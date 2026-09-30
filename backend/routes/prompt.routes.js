const express = require('express');
const router = express.Router();
const promptController = require('../controllers/prompt.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/optimize', promptController.handleOptimizePrompt);
router.get('/', promptController.getPrompts);
router.get('/:id', promptController.getPromptById);

module.exports = router;
