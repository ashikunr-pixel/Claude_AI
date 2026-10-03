const { BudgetSetting, ApiUsage } = require('../models');
require('dotenv').config();

const DEFAULT_BUDGET = parseFloat(process.env.AI_BUDGET_USD || '5.00');

/**
 * Retrieve current budget settings and cumulative application spending from MongoDB Atlas
 */
async function getBudgetStatus(apiKeyId = null) {
  let budgetUsd = DEFAULT_BUDGET;
  let warningThreshold = 80;
  let hardStopEnabled = false;

  try {
    const b = await BudgetSetting.findOne().sort({ setting_id: -1 }).lean();
    if (b) {
      budgetUsd = parseFloat(b.budget_usd);
      warningThreshold = parseInt(b.warning_threshold, 10);
      hardStopEnabled = Boolean(b.hard_stop_enabled);
    }
  } catch {}

  let cumulativeSpent = 0;
  let totalRequests = 0;
  try {
    const query = {};
    if (apiKeyId && apiKeyId !== 'all') {
      const numKey = Number(apiKeyId);
      if (numKey === 1) {
        query.$or = [{ api_key_id: 1 }, { api_key_id: null }, { api_key_id: { $exists: false } }];
      } else {
        query.api_key_id = numKey;
      }
    }
    const usages = await ApiUsage.find(query, 'request_cost').lean();
    totalRequests = usages.length;
    cumulativeSpent = usages.reduce((acc, u) => acc + (u.request_cost || 0), 0);
  } catch {}

  const remainingBudget = Math.max(0, budgetUsd - cumulativeSpent);
  const usagePercentage = budgetUsd > 0 ? Math.min(100, (cumulativeSpent / budgetUsd) * 100) : 0;

  const isExceeded = cumulativeSpent >= budgetUsd;
  const isWarning = usagePercentage >= warningThreshold && !isExceeded;

  let statusLabel = 'SAFE';
  if (isExceeded) statusLabel = 'BUDGET_EXHAUSTED';
  else if (isWarning) statusLabel = 'NEAR_LIMIT';

  return {
    apiKeyId: apiKeyId ? Number(apiKeyId) : null,
    budgetUsd: Number(budgetUsd.toFixed(2)),
    cumulativeSpent: Number(cumulativeSpent.toFixed(6)),
    remainingBudget: Number(remainingBudget.toFixed(6)),
    usagePercentage: Number(usagePercentage.toFixed(2)),
    warningThreshold,
    hardStopEnabled,
    totalRequests,
    status: statusLabel,
    averageCostPerRequest: totalRequests > 0 ? Number((cumulativeSpent / totalRequests).toFixed(6)) : 0.0,
    disclaimer: 'The $5.00 value is a local application safety budget; it is not a direct reflection of your Claude Console billing balance.'
  };
}

/**
 * Pre-check whether a request is safe to process against the safety budget
 */
async function checkBudgetSafety(estimatedCost, taskHardStopOption = null, apiKeyId = null) {
  const current = await getBudgetStatus(apiKeyId);
  const willExceed = (current.cumulativeSpent + estimatedCost) > current.budgetUsd;
  const hardStopActive = taskHardStopOption !== null ? taskHardStopOption : current.hardStopEnabled;

  if (willExceed && hardStopActive) {
    return {
      allowed: false,
      warning: true,
      hardBlocked: true,
      currentSpent: current.cumulativeSpent,
      remaining: current.remainingBudget,
      estimatedCost,
      message: `Hard Budget Protection is ACTIVE. This request (est. $${estimatedCost.toFixed(4)}) exceeds your remaining application safety budget ($${current.remainingBudget.toFixed(4)}).`
    };
  }

  if (willExceed) {
    return {
      allowed: true,
      warning: true,
      hardBlocked: false,
      currentSpent: current.cumulativeSpent,
      remaining: current.remainingBudget,
      estimatedCost,
      message: `Warning: This request (est. $${estimatedCost.toFixed(4)}) may exceed your configured $${current.budgetUsd.toFixed(2)} application safety budget.`
    };
  }

  return {
    allowed: true,
    warning: false,
    hardBlocked: false,
    currentSpent: current.cumulativeSpent,
    remaining: current.remainingBudget,
    estimatedCost,
    message: 'Safe to process. Within application safety budget.'
  };
}

/**
 * Update budget settings (Admin only) in MongoDB Atlas
 */
async function updateBudgetSettings(budgetUsd, warningThreshold, hardStopEnabled) {
  try {
    await BudgetSetting.findOneAndUpdate(
      { setting_id: 1 },
      {
        setting_id: 1,
        budget_usd: parseFloat(budgetUsd),
        warning_threshold: parseInt(warningThreshold, 10),
        hard_stop_enabled: hardStopEnabled ? true : false,
        updated_at: new Date()
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[BudgetSetting] Failed to update budget setting in MongoDB:', err.message);
  }

  return await getBudgetStatus();
}

module.exports = {
  getBudgetStatus,
  checkBudgetSafety,
  updateBudgetSettings
};
