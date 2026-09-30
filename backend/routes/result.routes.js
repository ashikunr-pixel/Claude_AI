const express = require('express');
const router = express.Router();
const resultController = require('../controllers/result.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/:id', resultController.getResultByTaskId);
router.get('/:id/download', resultController.downloadResult);

module.exports = router;
