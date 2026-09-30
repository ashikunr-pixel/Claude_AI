const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budget.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', budgetController.getBudget);
router.put('/', requireAdmin, budgetController.updateBudget);
router.post('/pre-check', budgetController.preCheck);

module.exports = router;
