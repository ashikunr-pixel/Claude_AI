const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/process', taskController.processTask);
router.get('/', taskController.getTasks);
router.get('/:id', taskController.getTaskById);

module.exports = router;
