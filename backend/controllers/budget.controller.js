const { getBudgetStatus, updateBudgetSettings, checkBudgetSafety } = require('../services/budget.service');
const { estimateRequestCost } = require('../services/cost.service');
const { estimateTokens } = require('../services/token.service');
const { DEFAULT_MODEL } = require('../config/ai');
const logger = require('../utils/logger');

async function getBudget(req, res, next) {
  try {
    const status = await getBudgetStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    next(err);
  }
}

async function updateBudget(req, res, next) {
  try {
    const { budgetUsd, warningThreshold, hardStopEnabled } = req.body;

    if (budgetUsd === undefined || isNaN(parseFloat(budgetUsd)) || parseFloat(budgetUsd) <= 0) {
      return res.status(400).json({ success: false, error: 'A valid positive budget amount is required.' });
    }

    const updated = await updateBudgetSettings(
      parseFloat(budgetUsd),
      parseInt(warningThreshold || 80, 10),
      Boolean(hardStopEnabled)
    );

    await logger.audit(req.user.user_id, 'UPDATE_BUDGET_SETTINGS', 'BUDGET', null, {
      budgetUsd,
      warningThreshold,
      hardStopEnabled
    });

    res.json({
      success: true,
      message: 'Application safety budget settings updated.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

async function preCheck(req, res, next) {
  try {
    const { prompt, fileText, model, maxOutputTokens, budgetProtection } = req.body;

    const fullContent = `${prompt || ''}\n${fileText || ''}`.trim();
    const estInputTokens = estimateTokens(fullContent);
    const maxTokens = parseInt(maxOutputTokens || '1024', 10);
    const selectedModel = model || DEFAULT_MODEL;

    const costEst = await estimateRequestCost(selectedModel, estInputTokens, maxTokens);
    const safety = await checkBudgetSafety(costEst.estimatedTotalCost, budgetProtection !== undefined ? Boolean(budgetProtection) : true);

    res.json({
      success: true,
      data: {
        estimatedInputTokens: estInputTokens,
        maxOutputTokens: maxTokens,
        model: selectedModel,
        estimatedCost: costEst.estimatedTotalCost,
        rates: costEst.rates,
        safety
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudget,
  updateBudget,
  preCheck
};
