const db = require('../config/database');
require('dotenv').config();

const DEFAULT_BUDGET = parseFloat(process.env.AI_BUDGET_USD || '5.00');

/**
 * Retrieve current budget settings and cumulative application spending from SQL Server
 */
async function getBudgetStatus() {
  try {
    // Query budget settings table
    const settingsResult = await db.query(
      'SELECT TOP 1 budget_usd, warning_threshold, hard_stop_enabled FROM dbo.budget_settings ORDER BY budget_id DESC'
    );

    let budgetUsd = DEFAULT_BUDGET;
    let warningThreshold = 80;
    let hardStopEnabled = false;

    if (settingsResult.recordset.length > 0) {
      const row = settingsResult.recordset[0];
      budgetUsd = parseFloat(row.budget_usd);
      warningThreshold = parseInt(row.warning_threshold, 10);
      hardStopEnabled = Boolean(row.hard_stop_enabled);
    }

    // Calculate cumulative application-tracked spending from dbo.api_usage
    const spendingResult = await db.query(
      'SELECT ISNULL(SUM(request_cost), 0.0) AS cumulative_spent, COUNT(*) as request_count FROM dbo.api_usage'
    );

    const cumulativeSpent = parseFloat(spendingResult.recordset[0].cumulative_spent || 0);
    const totalRequests = parseInt(spendingResult.recordset[0].request_count || 0, 10);
    const remainingBudget = Math.max(0, budgetUsd - cumulativeSpent);
    const usagePercentage = budgetUsd > 0 ? Math.min(100, (cumulativeSpent / budgetUsd) * 100) : 0;

    const isExceeded = cumulativeSpent >= budgetUsd;
    const isWarning = usagePercentage >= warningThreshold && !isExceeded;

    let statusLabel = 'SAFE';
    if (isExceeded) statusLabel = 'BUDGET_EXHAUSTED';
    else if (isWarning) statusLabel = 'NEAR_LIMIT';

    return {
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
  } catch (sqlErr) {
    // MongoDB Atlas fallback if SQL Server is not reachable
    try {
      const { BudgetSetting, ApiUsage } = require('../models');
      const b = await BudgetSetting.findOne().sort({ setting_id: -1 });
      const budgetUsd = b ? parseFloat(b.budget_usd) : DEFAULT_BUDGET;
      const warningThreshold = b ? parseInt(b.warning_threshold, 10) : 80;
      const hardStopEnabled = b ? Boolean(b.hard_stop_enabled) : false;

      const usages = await ApiUsage.find({});
      const cumulativeSpent = usages.reduce((acc, u) => acc + (u.request_cost || 0), 0);
      const totalRequests = usages.length;
      const remainingBudget = Math.max(0, budgetUsd - cumulativeSpent);
      const usagePercentage = budgetUsd > 0 ? Math.min(100, (cumulativeSpent / budgetUsd) * 100) : 0;

      const isExceeded = cumulativeSpent >= budgetUsd;
      const isWarning = usagePercentage >= warningThreshold && !isExceeded;

      let statusLabel = 'SAFE';
      if (isExceeded) statusLabel = 'BUDGET_EXHAUSTED';
      else if (isWarning) statusLabel = 'NEAR_LIMIT';

      return {
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
    } catch {
      // In-memory defaults
      return {
        budgetUsd: DEFAULT_BUDGET,
        cumulativeSpent: 0,
        remainingBudget: DEFAULT_BUDGET,
        usagePercentage: 0,
        warningThreshold: 80,
        hardStopEnabled: false,
        totalRequests: 0,
        status: 'SAFE',
        averageCostPerRequest: 0,
        disclaimer: 'Default budget status active.'
      };
    }
  }
}

/**
 * Pre-check whether a request is safe to process against the safety budget
 * @param {number} estimatedCost 
 * @param {boolean} taskHardStopOption - User request override if set
 */
async function checkBudgetSafety(estimatedCost, taskHardStopOption = null) {
  const current = await getBudgetStatus();
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
      allowed: true, // User can proceed with warning
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
 * Update budget settings (Admin only)
 */
async function updateBudgetSettings(budgetUsd, warningThreshold, hardStopEnabled) {
  try {
    await db.query(
      `INSERT INTO dbo.budget_settings (budget_usd, warning_threshold, hard_stop_enabled, updated_at)
       VALUES (@budgetUsd, @warningThreshold, @hardStopEnabled, SYSUTCDATETIME())`,
      {
        budgetUsd: parseFloat(budgetUsd),
        warningThreshold: parseInt(warningThreshold, 10),
        hardStopEnabled: hardStopEnabled ? 1 : 0
      }
    );
  } catch (sqlErr) {
    try {
      const { BudgetSetting } = require('../models');
      await BudgetSetting.findOneAndUpdate(
        { setting_id: 1 },
        {
          budget_usd: parseFloat(budgetUsd),
          warning_threshold: parseInt(warningThreshold, 10),
          hard_stop_enabled: hardStopEnabled ? true : false,
          updated_at: new Date()
        },
        { upsert: true, new: true }
      );
    } catch {}
  }

  return await getBudgetStatus();
}

module.exports = {
  getBudgetStatus,
  checkBudgetSafety,
  updateBudgetSettings
};
