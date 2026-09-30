const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/upload', fileController.uploadFile);
router.get('/', fileController.getFiles);
router.get('/:id', fileController.getFileById);
router.get('/:id/download', fileController.downloadFile);

module.exports = router;
