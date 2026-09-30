const db = require('../config/database');
const { calculateRequestCost } = require('./cost.service');
const { getBudgetStatus } = require('./budget.service');
const mongoService = require('./mongo.service');

/**
 * Record usage after an API request completes
 */
async function recordRequestUsage({
  requestId,
  model,
  inputTokens,
  outputTokens,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
  processingTimeMs = 0,
  status = 'SUCCESS',
  errorMessage = null
}) {
  const costData = await calculateRequestCost(
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens
  );

  const budget = await getBudgetStatus();
  const requestCost = costData.totalCost;
  const newCumulativeCost = Number((budget.cumulativeSpent + requestCost).toFixed(6));
  const newRemainingBudget = Math.max(0, Number((budget.budgetUsd - newCumulativeCost).toFixed(6)));
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  let usageId = Math.floor(Date.now() / 1000);
  try {
    // Insert usage record
    const result = await db.query(
      `INSERT INTO dbo.api_usage (
         request_id, input_tokens, output_tokens, total_tokens,
         cache_creation_tokens, cache_read_tokens, request_cost,
         cumulative_cost, remaining_budget, created_at
       )
       VALUES (
         @requestId, @inputTokens, @outputTokens, @totalTokens,
         @cacheCreationTokens, @cacheReadTokens, @requestCost,
         @newCumulativeCost, @newRemainingBudget, SYSUTCDATETIME()
       );
       SELECT SCOPE_IDENTITY() AS usage_id;`,
      {
        requestId,
        inputTokens,
        outputTokens,
        totalTokens,
        cacheCreationTokens,
        cacheReadTokens,
        requestCost,
        newCumulativeCost,
        newRemainingBudget
      }
    );

    usageId = result.recordset[0].usage_id;

    // Update request status and time
    await db.query(
      `UPDATE dbo.api_requests 
       SET status = @status, 
           processing_time_ms = @processingTimeMs, 
           error_message = @errorMessage 
       WHERE request_id = @requestId`,
      {
        status,
        processingTimeMs,
        errorMessage,
        requestId
      }
    );
  } catch (sqlErr) {
    console.warn('[UsageService] SQL write bypassed, syncing to MongoDB Atlas:', sqlErr.message);
  }

  // Sync to MongoDB if connected
  mongoService.syncApiUsage({
    usageId,
    requestId,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheCreationTokens,
    cacheReadTokens,
    requestCost,
    cumulativeCost: newCumulativeCost,
    remainingBudget: newRemainingBudget
  });

  return {
    usageId,
    requestId,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheCreationTokens,
    cacheReadTokens,
    requestCost,
    cumulativeCost: newCumulativeCost,
    remainingBudget: newRemainingBudget,
    rates: costData.rates
  };
}

/**
 * Get aggregated dashboard metrics (Single Source of Truth)
 */
async function getDashboardSummary(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const userFilter = !isAdmin && userId ? 'WHERE r.user_id = @userId' : '';
  const taskUserFilter = !isAdmin && userId ? 'WHERE t.user_id = @userId' : '';

  try {
    // 1. Core Totals
    const queryTotals = `
      SELECT 
        ISNULL(COUNT(u.usage_id), 0) AS total_requests,
        ISNULL(SUM(CAST(u.input_tokens AS BIGINT)), 0) AS total_input_tokens,
        ISNULL(SUM(CAST(u.output_tokens AS BIGINT)), 0) AS total_output_tokens,
        ISNULL(SUM(CAST(u.total_tokens AS BIGINT)), 0) AS total_tokens,
        ISNULL(SUM(u.request_cost), 0.0) AS total_cost
      FROM dbo.api_usage u
      JOIN dbo.api_requests r ON u.request_id = r.request_id
      ${userFilter}
    `;

    const totalsResult = await db.query(queryTotals, { userId });
    const totals = totalsResult.recordset[0];

    // 2. Total Tasks Count
    const tasksResult = await db.query(
      `SELECT COUNT(*) AS total_tasks FROM dbo.tasks t ${taskUserFilter}`,
      { userId }
    );
    const totalTasks = tasksResult.recordset[0].total_tasks;

    // 3. Application Safety Budget
    const budget = await getBudgetStatus();

    const totalCost = parseFloat(totals.total_cost || 0);
    const totalRequests = parseInt(totals.total_requests || 0, 10);
    const avgCostPerRequest = totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0.0;

    return {
      totalTasks,
      totalRequests,
      inputTokens: parseInt(totals.total_input_tokens || 0, 10),
      outputTokens: parseInt(totals.total_output_tokens || 0, 10),
      totalTokens: parseInt(totals.total_tokens || 0, 10),
      totalCost: Number(totalCost.toFixed(6)),
      applicationBudget: budget.budgetUsd,
      usedBudget: budget.cumulativeSpent,
      remainingBudget: budget.remainingBudget,
      usagePercentage: budget.usagePercentage,
      avgCostPerRequest,
      budgetStatus: budget.status,
      warningThreshold: budget.warningThreshold,
      hardStopEnabled: budget.hardStopEnabled
    };
  } catch (sqlErr) {
    // MongoDB Atlas fallback
    try {
      const { ApiUsage, Task } = require('../models');
      const budget = await getBudgetStatus();
      const usages = await ApiUsage.find({});
      const totalTasks = await Task.countDocuments({});

      const totalRequests = usages.length;
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let totalCost = 0;

      for (const u of usages) {
        inputTokens += (u.input_tokens || 0);
        outputTokens += (u.output_tokens || 0);
        totalTokens += (u.total_tokens || (u.input_tokens || 0) + (u.output_tokens || 0));
        totalCost += (u.request_cost || 0);
      }

      const avgCostPerRequest = totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0.0;

      return {
        totalTasks,
        totalRequests,
        inputTokens,
        outputTokens,
        totalTokens,
        totalCost: Number(totalCost.toFixed(6)),
        applicationBudget: budget.budgetUsd,
        usedBudget: budget.cumulativeSpent,
        remainingBudget: budget.remainingBudget,
        usagePercentage: budget.usagePercentage,
        avgCostPerRequest,
        budgetStatus: budget.status,
        warningThreshold: budget.warningThreshold,
        hardStopEnabled: budget.hardStopEnabled
      };
    } catch {
      const budget = await getBudgetStatus();
      return {
        totalTasks: 0,
        totalRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        applicationBudget: budget.budgetUsd,
        usedBudget: 0,
        remainingBudget: budget.budgetUsd,
        usagePercentage: 0,
        avgCostPerRequest: 0,
        budgetStatus: 'SAFE',
        warningThreshold: 80,
        hardStopEnabled: false
      };
    }
  }
}

/**
 * Get request history with search, filtering, and pagination
 */
async function getUsageRequests({
  userId = null,
  role = 'USER',
  search = '',
  model = '',
  taskType = '',
  dateRange = 'all', // 'today', 'yesterday', '7days', '30days', 'all'
  page = 1,
  limit = 20
}) {
  const isAdmin = role === 'ADMIN';
  const conditions = [];
  const params = {};

  if (!isAdmin && userId) {
    conditions.push('r.user_id = @userId');
    params.userId = userId;
  }

  if (model) {
    conditions.push('r.model = @model');
    params.model = model;
  }

  if (taskType) {
    conditions.push('t.task_type = @taskType');
    params.taskType = taskType;
  }

  if (dateRange === 'today') {
    conditions.push("r.created_at >= CAST(GETUTCDATE() AS DATE)");
  } else if (dateRange === 'yesterday') {
    conditions.push("r.created_at >= DATEADD(day, -1, CAST(GETUTCDATE() AS DATE)) AND r.created_at < CAST(GETUTCDATE() AS DATE)");
  } else if (dateRange === '7days') {
    conditions.push("r.created_at >= DATEADD(day, -7, GETUTCDATE())");
  } else if (dateRange === '30days') {
    conditions.push("r.created_at >= DATEADD(day, -30, GETUTCDATE())");
  }

  if (search) {
    conditions.push('(p.original_prompt LIKE @search OR t.task_type LIKE @search OR u.name LIKE @search)');
    params.search = `%${search}%`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  params.offset = offset;
  params.limit = limit;

  // Count total records
  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM dbo.api_requests r
    LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
    LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
    LEFT JOIN dbo.users u ON r.user_id = u.user_id
    ${whereClause}
  `;
  try {
    const countRes = await db.query(countSql, params);
    const totalCount = countRes.recordset[0].total_count;

    // Paged records
    const dataSql = `
      SELECT 
        r.request_id,
        r.created_at,
        r.model,
        r.provider,
        r.status,
        r.processing_time_ms,
        t.task_id,
        t.task_type,
        u.name AS user_name,
        u.email AS user_email,
        p.original_prompt,
        p.optimized_prompt,
        ISNULL(us.input_tokens, 0) AS input_tokens,
        ISNULL(us.output_tokens, 0) AS output_tokens,
        ISNULL(us.total_tokens, 0) AS total_tokens,
        ISNULL(us.request_cost, 0.0) AS request_cost,
        ISNULL(us.cumulative_cost, 0.0) AS cumulative_cost,
        ISNULL(us.remaining_budget, 5.0) AS remaining_budget
      FROM dbo.api_requests r
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
      LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
      LEFT JOIN dbo.users u ON r.user_id = u.user_id
      ${whereClause}
      ORDER BY r.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const dataRes = await db.query(dataSql, params);

    return {
      requests: dataRes.recordset,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  } catch (sqlErr) {
    try {
      const { ApiRequest, ApiUsage } = require('../models');
      const docs = await ApiRequest.find().sort({ created_at: -1 }).skip(offset).limit(limit);
      const totalCount = await ApiRequest.countDocuments();
      const usages = await ApiUsage.find();
      const usageMap = new Map();
      usages.forEach(u => usageMap.set(u.request_id, u));

      const requests = docs.map(d => {
        const u = usageMap.get(d.request_id) || {};
        return {
          request_id: d.request_id,
          created_at: d.created_at,
          model: d.model,
          provider: d.provider,
          status: d.status,
          processing_time_ms: d.processing_time_ms,
          task_id: d.task_id,
          task_type: 'General',
          input_tokens: u.input_tokens || 0,
          output_tokens: u.output_tokens || 0,
          total_tokens: u.total_tokens || 0,
          request_cost: u.request_cost || 0,
          cumulative_cost: u.cumulative_cost || 0,
          remaining_budget: u.remaining_budget || 5.0
        };
      });

      return {
        requests,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    } catch {
      return {
        requests: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1 }
      };
    }
  }
}

/**
 * Get detailed request record by ID
 */
async function getRequestDetails(requestId, userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const params = { requestId };

  let authCheck = '';
  if (!isAdmin && userId) {
    authCheck = 'AND r.user_id = @userId';
    params.userId = userId;
  }

  const querySql = `
    SELECT 
      r.request_id,
      r.user_id,
      r.model,
      r.provider,
      r.status,
      r.processing_time_ms,
      r.error_message,
      r.created_at,
      u.name AS user_name,
      u.email AS user_email,
      t.task_id,
      t.task_type,
      t.runtime_options,
      p.prompt_id,
      p.original_prompt,
      p.optimized_prompt,
      p.optimization_mode,
      p.changes_summary,
      f.file_id,
      f.file_name,
      f.file_type,
      f.file_size,
      gr.result_id,
      gr.result_content,
      gr.result_format,
      us.usage_id,
      ISNULL(us.input_tokens, 0) AS input_tokens,
      ISNULL(us.output_tokens, 0) AS output_tokens,
      ISNULL(us.total_tokens, 0) AS total_tokens,
      ISNULL(us.cache_read_tokens, 0) AS cache_read_tokens,
      ISNULL(us.cache_creation_tokens, 0) AS cache_creation_tokens,
      ISNULL(us.request_cost, 0.0) AS request_cost,
      ISNULL(us.cumulative_cost, 0.0) AS cumulative_cost,
      ISNULL(us.remaining_budget, 5.0) AS remaining_budget
    FROM dbo.api_requests r
    JOIN dbo.users u ON r.user_id = u.user_id
    LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
    LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
    LEFT JOIN dbo.files f ON t.task_id = f.task_id
    LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
    LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
    WHERE r.request_id = @requestId ${authCheck}
  `;

  const result = await db.query(querySql, params);
  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  // Retrieve executed features for this task
  let features = [];
  if (row.task_id) {
    const featResult = await db.query(
      `SELECT f.feature_name, f.category, f.description
       FROM dbo.task_features tf
       JOIN dbo.ai_features f ON tf.feature_id = f.feature_id
       WHERE tf.task_id = @taskId`,
      { taskId: row.task_id }
    );
    features = featResult.recordset;
  }

  row.ai_features = features;
  return row;
}

/**
 * Get Analytics Chart Data
 */
async function getChartAnalytics(userId = null, role = 'USER', range = '7days') {
  const isAdmin = role === 'ADMIN';
  const params = {};
  const userFilter = !isAdmin && userId ? 'AND r.user_id = @userId' : '';
  if (!isAdmin && userId) params.userId = userId;

  let daysBack = 7;
  if (range === '30days') daysBack = 30;
  if (range === 'today') daysBack = 1;
  params.daysBack = daysBack;

  try {
    // 1. Cost & Tokens Over Time (by Day)
    const timelineSql = `
      SELECT 
        CONVERT(VARCHAR(10), r.created_at, 120) AS date_label,
        COUNT(r.request_id) AS request_count,
        ISNULL(SUM(u.input_tokens), 0) AS input_tokens,
        ISNULL(SUM(u.output_tokens), 0) AS output_tokens,
        ISNULL(SUM(u.request_cost), 0.0) AS total_cost
      FROM dbo.api_requests r
      LEFT JOIN dbo.api_usage u ON r.request_id = u.request_id
      WHERE r.created_at >= DATEADD(day, -@daysBack, GETUTCDATE()) ${userFilter}
      GROUP BY CONVERT(VARCHAR(10), r.created_at, 120)
      ORDER BY date_label ASC;
    `;
    const timelineRes = await db.query(timelineSql, params);

    // 2. Model Usage Breakdown
    const modelSql = `
      SELECT 
        r.model,
        COUNT(r.request_id) AS count,
        ISNULL(SUM(u.request_cost), 0.0) AS total_cost,
        ISNULL(SUM(u.total_tokens), 0) AS total_tokens
      FROM dbo.api_requests r
      LEFT JOIN dbo.api_usage u ON r.request_id = u.request_id
      WHERE 1=1 ${userFilter}
      GROUP BY r.model
      ORDER BY count DESC;
    `;
    const modelRes = await db.query(modelSql, params);

    // 3. Task Type Usage
    const taskSql = `
      SELECT 
        ISNULL(t.task_type, 'Direct Prompt') AS task_type,
        COUNT(r.request_id) AS count
      FROM dbo.api_requests r
      LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
      WHERE 1=1 ${userFilter}
      GROUP BY t.task_type
      ORDER BY count DESC;
    `;
    const taskRes = await db.query(taskSql, params);

    // 4. AI Features Actually Used
    const featuresSql = `
      SELECT 
        af.feature_name,
        af.category,
        COUNT(tf.task_id) AS count
      FROM dbo.task_features tf
      JOIN dbo.ai_features af ON tf.feature_id = af.feature_id
      JOIN dbo.tasks t ON tf.task_id = t.task_id
      ${!isAdmin && userId ? 'WHERE t.user_id = @userId' : ''}
      GROUP BY af.feature_name, af.category
      ORDER BY count DESC;
    `;
    const featuresRes = await db.query(featuresSql, params);

    return {
      timeline: timelineRes.recordset,
      modelUsage: modelRes.recordset,
      taskTypeUsage: taskRes.recordset,
      featureUsage: featuresRes.recordset
    };
  } catch (sqlErr) {
    try {
      const { ApiRequest, ApiUsage } = require('../models');
      const requests = await ApiRequest.find();
      const usages = await ApiUsage.find();
      const usageMap = new Map();
      usages.forEach(u => usageMap.set(u.request_id, u));

      const modelMap = {};
      requests.forEach(r => {
        const m = r.model || 'claude-sonnet-4-6';
        const u = usageMap.get(r.request_id) || {};
        if (!modelMap[m]) modelMap[m] = { model: m, count: 0, total_cost: 0, total_tokens: 0 };
        modelMap[m].count++;
        modelMap[m].total_cost += (u.request_cost || 0);
        modelMap[m].total_tokens += (u.total_tokens || 0);
      });

      return {
        timeline: [],
        modelUsage: Object.values(modelMap),
        taskTypeUsage: [{ task_type: 'General', count: requests.length }],
        featureUsage: []
      };
    } catch {
      return {
        timeline: [],
        modelUsage: [],
        taskTypeUsage: [],
        featureUsage: []
      };
    }
  }
}

/**
 * Get usage breakdown grouped by user
 */
async function getUsageByUser(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const filter = !isAdmin && userId ? 'WHERE u.user_id = @userId' : '';

  try {
    const sql = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.role,
        COUNT(r.request_id) AS total_requests,
        ISNULL(SUM(us.input_tokens), 0) AS total_input_tokens,
        ISNULL(SUM(us.output_tokens), 0) AS total_output_tokens,
        ISNULL(SUM(us.total_tokens), 0) AS total_tokens,
        ISNULL(SUM(us.request_cost), 0.0) AS total_cost,
        MAX(r.created_at) AS last_active
      FROM dbo.users u
      LEFT JOIN dbo.api_requests r ON u.user_id = r.user_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      ${filter}
      GROUP BY u.user_id, u.name, u.email, u.role
      ORDER BY total_cost DESC;
    `;

    const res = await db.query(sql, { userId });
    return res.recordset;
  } catch (sqlErr) {
    try {
      const { User } = require('../models');
      const users = await User.find();
      return users.map(u => ({
        user_id: u.user_id || 1,
        name: u.name,
        email: u.email,
        role: u.role,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_tokens: 0,
        total_cost: 0,
        last_active: u.created_at
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Get detailed feature usage matrix
 */
async function getUsageByFeature(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const filter = !isAdmin && userId ? 'WHERE t.user_id = @userId' : '';

  const sql = `
    SELECT 
      af.feature_id,
      af.feature_name,
      af.category,
      af.description,
      COUNT(tf.task_id) AS execution_count,
      ISNULL(SUM(us.total_tokens), 0) AS total_tokens,
      ISNULL(SUM(us.request_cost), 0.0) AS total_cost
    FROM dbo.ai_features af
    LEFT JOIN dbo.task_features tf ON af.feature_id = tf.feature_id
    LEFT JOIN dbo.tasks t ON tf.task_id = t.task_id
    LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
    LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
    ${filter}
    GROUP BY af.feature_id, af.feature_name, af.category, af.description
    HAVING COUNT(tf.task_id) > 0
    ORDER BY execution_count DESC;
  `;

  const res = await db.query(sql, { userId });
  return res.recordset;
}

module.exports = {
  recordRequestUsage,
  getDashboardSummary,
  getUsageRequests,
  getRequestDetails,
  getChartAnalytics,
  getUsageByUser,
  getUsageByFeature
};
