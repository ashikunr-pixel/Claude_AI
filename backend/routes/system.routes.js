const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isApiKeyConfigured, getMaskedApiKey, DEFAULT_MODEL } = require('../config/ai');
const { getBudgetStatus } = require('../services/budget.service');
const { isMongoConnected } = require('../config/mongo');

// Public or authenticated system status check
router.get('/status', async (req, res, next) => {
  try {
    let budget = { budgetUsd: 5.0, cumulativeSpent: 0, remainingBudget: 5.0 };
    let dbConnected = false;
    try {
      budget = await getBudgetStatus();
      dbConnected = true;
    } catch (bErr) {
      if (isMongoConnected()) {
        try {
          const { BudgetSetting, ApiUsage } = require('../models');
          const b = await BudgetSetting.findOne({ setting_id: 1 });
          const usages = await ApiUsage.find({});
          const spent = usages.reduce((acc, u) => acc + (u.request_cost || 0), 0);
          budget = {
            budgetUsd: b ? b.budget_usd : 5.0,
            cumulativeSpent: spent,
            remainingBudget: Math.max(0, (b ? b.budget_usd : 5.0) - spent)
          };
          dbConnected = true;
        } catch {}
      }
    }
    res.json({
      success: true,
      service: 'Claude AI Platform',
      version: '1.0.0',
      apiKeyConfigured: isApiKeyConfigured(),
      maskedApiKey: getMaskedApiKey(),
      defaultModel: DEFAULT_MODEL,
      budgetSafetyUsd: budget.budgetUsd,
      databaseConnected: dbConnected,
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
    try {
      const result = await db.query(
        `SELECT pricing_id, provider, model, input_price_per_million, output_price_per_million, 
                cache_read_price, cache_write_price, is_active
         FROM dbo.model_pricing
         WHERE is_active = 1
         ORDER BY input_price_per_million ASC`
      );
      return res.json({ success: true, data: result.recordset });
    } catch (sqlErr) {
      if (isMongoConnected()) {
        const { ModelPricing } = require('../models');
        const docs = await ModelPricing.find({ is_active: true }).sort({ input_price_per_million: 1 });
        return res.json({ success: true, data: docs });
      }
      throw sqlErr;
    }
  } catch (err) {
    next(err);
  }
});

// Get AI Toolkit catalog
router.get('/features', async (req, res, next) => {
  try {
    try {
      const result = await db.query(
        `SELECT feature_id, feature_name, category, description 
         FROM dbo.ai_features 
         ORDER BY category, feature_name`
      );
      return res.json({ success: true, data: result.recordset });
    } catch (sqlErr) {
      if (isMongoConnected()) {
        const { AiFeature } = require('../models');
        const docs = await AiFeature.find({}).sort({ category: 1, feature_name: 1 });
        return res.json({ success: true, data: docs });
      }
      throw sqlErr;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
