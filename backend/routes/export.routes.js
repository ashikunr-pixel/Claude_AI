const express = require('express');
const router = express.Router();
const exportController = require('../controllers/export.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/usage/json', exportController.exportUsageJson);
router.get('/usage/excel', exportController.exportUsageExcel);
router.get('/report/excel', exportController.exportCompleteReportExcel);
router.get('/master/excel', exportController.exportCompleteReportExcel);
router.get('/report/json', exportController.exportCompleteReportJson);
router.get('/master/json', exportController.exportCompleteReportJson);

module.exports = router;
