const express = require('express');
const router = express.Router();
const db = require('../config/database');
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
      databaseConnected: true,
      mongoConnected: isMongoConnected(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// Get available models & dynamic pricing
router.get('/models', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT pricing_id, provider, model, input_price_per_million, output_price_per_million, 
              cache_read_price, cache_write_price, is_active
       FROM dbo.model_pricing
       WHERE is_active = 1
       ORDER BY input_price_per_million ASC`
    );

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    next(err);
  }
});

// Get AI Toolkit catalog
router.get('/features', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT feature_id, feature_name, category, description 
       FROM dbo.ai_features 
       ORDER BY category, feature_name`
    );

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
