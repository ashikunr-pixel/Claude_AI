const express = require('express');
const router = express.Router();
const keyController = require('../controllers/key.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', keyController.getKeys);
router.get('/:id', keyController.getKey);
router.post('/', keyController.addKey);
router.put('/:id', keyController.modifyKey);
router.delete('/:id', keyController.removeKey);
router.post('/test', keyController.testKey);
router.post('/:id/test', keyController.testKey);

module.exports = router;
