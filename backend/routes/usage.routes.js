const express = require('express');
const router = express.Router();
const usageController = require('../controllers/usage.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/summary', usageController.getSummary);
router.get('/requests', usageController.getRequests);
router.get('/requests/:id', usageController.getRequestById);
router.get('/charts', usageController.getCharts);
router.get('/by-user', usageController.getByUser);
router.get('/by-feature', usageController.getByFeature);

module.exports = router;
