const express = require('express');
const router = express.Router();
const { ModelPricing, AiFeature, BudgetSetting, ApiUsage } = require('../models');
const { isApiKeyConfigured, getMaskedApiKey, DEFAULT_MODEL } = require('../config/ai');
const { getBudgetStatus } = require('../services/budget.service');
const { isMongoConnected } = require('../config/mongo');

// Public or authenticated system status check
router.get('/status', async (req, res, next) => {
  try {
    const budget = await getBudgetStatus();
    res.json({
      success: true,
      service: 'Claude AI Platform',
      version: '1.0.0',
      apiKeyConfigured: isApiKeyConfigured(),
      maskedApiKey: getMaskedApiKey(),
      defaultModel: DEFAULT_MODEL,
      budgetSafetyUsd: budget.budgetUsd,
      databaseConnected: isMongoConnected(),
      mongoConnected: isMongoConnected(),
      databaseEngine: 'MongoDB Atlas',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// Get available models & dynamic pricing from MongoDB Atlas
router.get('/models', async (req, res, next) => {
  try {
    const docs = await ModelPricing.find({ is_active: true }).sort({ input_price_per_million: 1 }).lean();
    return res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
});

// Get AI Toolkit catalog from MongoDB Atlas
router.get('/features', async (req, res, next) => {
  try {
    const docs = await AiFeature.find({}).sort({ category: 1, feature_name: 1 }).lean();
    return res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
