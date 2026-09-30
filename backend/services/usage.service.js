const {
  ApiUsage,
  ApiRequest,
  Task,
  Prompt,
  User,
  File,
  GeneratedResult,
  AiFeature,
  TaskFeature,
  getNextSequence
} = require('../models');
const { calculateRequestCost } = require('./cost.service');
const { getBudgetStatus } = require('./budget.service');

/**
 * Record usage after an API request completes (MongoDB Atlas)
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

  const usageId = await getNextSequence('usageId');

  await ApiUsage.create({
    usage_id: usageId,
    request_id: requestId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cache_creation_tokens: cacheCreationTokens,
    cache_read_tokens: cacheReadTokens,
    request_cost: requestCost,
    cumulative_cost: newCumulativeCost,
    remaining_budget: newRemainingBudget,
    created_at: new Date()
  });

  await ApiRequest.findOneAndUpdate(
    { request_id: requestId },
    {
      status,
      processing_time_ms: processingTimeMs,
      error_message: errorMessage
    }
  );

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
 * Get aggregated dashboard metrics (MongoDB Atlas)
 */
async function getDashboardSummary(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const query = !isAdmin && userId ? { user_id: userId } : {};

  const budget = await getBudgetStatus();

  let totalTasks = 0;
  let usages = [];
  try {
    totalTasks = await Task.countDocuments(query);
    if (!isAdmin && userId) {
      const userRequests = await ApiRequest.find({ user_id: userId }, 'request_id').lean();
      const requestIds = userRequests.map(r => r.request_id);
      usages = await ApiUsage.find({ request_id: { $in: requestIds } }).lean();
    } else {
      usages = await ApiUsage.find().lean();
    }
  } catch {}

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
}

/**
 * Get request history with search, filtering, and pagination (MongoDB Atlas)
 */
async function getUsageRequests({
  userId = null,
  role = 'USER',
  search = '',
  model = '',
  taskType = '',
  dateRange = 'all',
  page = 1,
  limit = 20
}) {
  const isAdmin = role === 'ADMIN';
  const offset = (page - 1) * limit;

  const query = {};
  if (!isAdmin && userId) {
    query.user_id = userId;
  }
  if (model) {
    query.model = model;
  }

  if (dateRange === 'today') {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    query.created_at = { $gte: startOfToday };
  } else if (dateRange === '7days') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    query.created_at = { $gte: sevenDaysAgo };
  } else if (dateRange === '30days') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    query.created_at = { $gte: thirtyDaysAgo };
  }

  const totalCount = await ApiRequest.countDocuments(query);
  const requests = await ApiRequest.find(query)
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const requestIds = requests.map(r => r.request_id);
  const taskIds = requests.map(r => r.task_id);
  const userIds = [...new Set(requests.map(r => r.user_id))];

  const [usages, tasks, prompts, users] = await Promise.all([
    ApiUsage.find({ request_id: { $in: requestIds } }).lean(),
    Task.find({ task_id: { $in: taskIds } }).lean(),
    Prompt.find({ task_id: { $in: taskIds } }).lean(),
    User.find({ user_id: { $in: userIds } }).lean()
  ]);

  const usageMap = new Map(usages.map(u => [u.request_id, u]));
  const taskMap = new Map(tasks.map(t => [t.task_id, t]));
  const promptMap = new Map(prompts.map(p => [p.task_id, p]));
  const userMap = new Map(users.map(u => [u.user_id, u]));

  const mappedRequests = requests.map(r => {
    const us = usageMap.get(r.request_id) || {};
    const t = taskMap.get(r.task_id) || {};
    const p = promptMap.get(r.task_id) || {};
    const u = userMap.get(r.user_id) || {};

    return {
      request_id: r.request_id,
      created_at: r.created_at,
      model: r.model,
      provider: r.provider || 'anthropic',
      status: r.status,
      processing_time_ms: r.processing_time_ms || 0,
      task_id: r.task_id,
      task_type: t.task_type || 'General',
      user_name: u.name || 'User',
      user_email: u.email || '',
      original_prompt: p.original_prompt || '',
      optimized_prompt: p.optimized_prompt || '',
      input_tokens: us.input_tokens || 0,
      output_tokens: us.output_tokens || 0,
      total_tokens: us.total_tokens || 0,
      request_cost: us.request_cost || 0,
      cumulative_cost: us.cumulative_cost || 0,
      remaining_budget: us.remaining_budget || 5.0
    };
  });

  return {
    requests: mappedRequests,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1
    }
  };
}

/**
 * Get detailed request record by ID (MongoDB Atlas)
 */
async function getRequestDetails(requestId, userId = null, role = 'USER') {
  const numericId = parseInt(requestId, 10);
  const isAdmin = role === 'ADMIN';

  const query = { request_id: numericId };
  if (!isAdmin && userId) {
    query.user_id = userId;
  }

  const reqDoc = await ApiRequest.findOne(query).lean();
  if (!reqDoc) return null;

  const [usage, task, user] = await Promise.all([
    ApiUsage.findOne({ request_id: numericId }).lean(),
    Task.findOne({ task_id: reqDoc.task_id }).lean(),
    User.findOne({ user_id: reqDoc.user_id }).lean()
  ]);

  let prompt = null;
  let file = null;
  let result = null;
  let aiFeatures = [];

  if (task) {
    [prompt, file, result] = await Promise.all([
      Prompt.findOne({ task_id: task.task_id }).lean(),
      File.findOne({ task_id: task.task_id }).lean(),
      GeneratedResult.findOne({ task_id: task.task_id }).lean()
    ]);

    const taskFeatures = await TaskFeature.find({ task_id: task.task_id }).lean();
    if (taskFeatures.length > 0) {
      const featureIds = taskFeatures.map(tf => tf.feature_id);
      aiFeatures = await AiFeature.find({ feature_id: { $in: featureIds } }).lean();
    }
  }

  return {
    request_id: reqDoc.request_id,
    user_id: reqDoc.user_id,
    model: reqDoc.model,
    provider: reqDoc.provider || 'anthropic',
    status: reqDoc.status,
    processing_time_ms: reqDoc.processing_time_ms || 0,
    error_message: reqDoc.error_message,
    created_at: reqDoc.created_at,
    user_name: user?.name || 'User',
    user_email: user?.email || '',
    task_id: task?.task_id,
    task_type: task?.task_type || 'General',
    runtime_options: task?.runtime_options,
    prompt_id: prompt?.prompt_id,
    original_prompt: prompt?.original_prompt || '',
    optimized_prompt: prompt?.optimized_prompt || '',
    optimization_mode: prompt?.optimization_mode || 'Standard',
    changes_summary: prompt?.changes_summary || '',
    file_id: file?.file_id,
    file_name: file?.file_name,
    file_type: file?.file_type,
    file_size: file?.file_size,
    result_id: result?.result_id,
    result_content: result?.result_text || '',
    result_format: result?.result_format || 'markdown',
    usage_id: usage?.usage_id,
    input_tokens: usage?.input_tokens || 0,
    output_tokens: usage?.output_tokens || 0,
    total_tokens: usage?.total_tokens || 0,
    cache_read_tokens: usage?.cache_read_tokens || 0,
    cache_creation_tokens: usage?.cache_creation_tokens || 0,
    request_cost: usage?.request_cost || 0,
    cumulative_cost: usage?.cumulative_cost || 0,
    remaining_budget: usage?.remaining_budget || 5.0,
    ai_features: aiFeatures
  };
}

/**
 * Get Analytics Chart Data (MongoDB Atlas)
 */
async function getChartAnalytics(userId = null, role = 'USER', range = '7days') {
  const isAdmin = role === 'ADMIN';
  const query = !isAdmin && userId ? { user_id: userId } : {};

  let daysBack = 7;
  if (range === '30days') daysBack = 30;
  if (range === 'today') daysBack = 1;

  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  query.created_at = { $gte: sinceDate };

  const requests = await ApiRequest.find(query).sort({ created_at: 1 }).lean();
  const requestIds = requests.map(r => r.request_id);
  const taskIds = requests.map(r => r.task_id);

  const [usages, tasks] = await Promise.all([
    ApiUsage.find({ request_id: { $in: requestIds } }).lean(),
    Task.find({ task_id: { $in: taskIds } }).lean()
  ]);

  const usageMap = new Map(usages.map(u => [u.request_id, u]));
  const taskMap = new Map(tasks.map(t => [t.task_id, t]));

  // 1. Timeline by Day
  const timelineMap = {};
  requests.forEach(r => {
    const d = new Date(r.created_at).toISOString().substring(0, 10);
    const u = usageMap.get(r.request_id) || {};
    if (!timelineMap[d]) {
      timelineMap[d] = {
        date_label: d,
        request_count: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_cost: 0
      };
    }
    timelineMap[d].request_count++;
    timelineMap[d].input_tokens += (u.input_tokens || 0);
    timelineMap[d].output_tokens += (u.output_tokens || 0);
    timelineMap[d].total_cost += (u.request_cost || 0);
  });

  // 2. Model Usage Breakdown
  const modelMap = {};
  requests.forEach(r => {
    const m = r.model || 'claude-sonnet-4-6';
    const u = usageMap.get(r.request_id) || {};
    if (!modelMap[m]) {
      modelMap[m] = { model: m, count: 0, total_cost: 0, total_tokens: 0 };
    }
    modelMap[m].count++;
    modelMap[m].total_cost += (u.request_cost || 0);
    modelMap[m].total_tokens += (u.total_tokens || 0);
  });

  // 3. Task Type Usage
  const taskTypeMap = {};
  requests.forEach(r => {
    const t = taskMap.get(r.task_id) || {};
    const type = t.task_type || 'Direct Prompt';
    if (!taskTypeMap[type]) {
      taskTypeMap[type] = { task_type: type, count: 0 };
    }
    taskTypeMap[type].count++;
  });

  // 4. Feature Usage
  const features = await AiFeature.find().lean();
  const featureUsage = features.map(f => ({
    feature_name: f.feature_name,
    category: f.category,
    count: 1
  }));

  return {
    timeline: Object.values(timelineMap),
    modelUsage: Object.values(modelMap),
    taskTypeUsage: Object.values(taskTypeMap),
    featureUsage
  };
}

/**
 * Get usage breakdown grouped by user (MongoDB Atlas)
 */
async function getUsageByUser(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const userQuery = !isAdmin && userId ? { user_id: userId } : {};

  const users = await User.find(userQuery).lean();
  const userRequests = await ApiRequest.find().lean();
  const usages = await ApiUsage.find().lean();

  const usageMap = new Map(usages.map(u => [u.request_id, u]));

  return users.map(u => {
    const myReqs = userRequests.filter(r => r.user_id === u.user_id);
    let totalIn = 0;
    let totalOut = 0;
    let totalAll = 0;
    let totalCost = 0;
    let lastActive = u.created_at;

    myReqs.forEach(r => {
      const us = usageMap.get(r.request_id) || {};
      totalIn += (us.input_tokens || 0);
      totalOut += (us.output_tokens || 0);
      totalAll += (us.total_tokens || 0);
      totalCost += (us.request_cost || 0);
      if (r.created_at && new Date(r.created_at) > new Date(lastActive)) {
        lastActive = r.created_at;
      }
    });

    return {
      user_id: u.user_id,
      name: u.name,
      email: u.email,
      role: u.role,
      total_requests: myReqs.length,
      total_input_tokens: totalIn,
      total_output_tokens: totalOut,
      total_tokens: totalAll,
      total_cost: Number(totalCost.toFixed(6)),
      last_active: lastActive
    };
  });
}

/**
 * Get detailed feature usage matrix (MongoDB Atlas)
 */
async function getUsageByFeature(userId = null, role = 'USER') {
  const features = await AiFeature.find().lean();
  return features.map(f => ({
    feature_id: f.feature_id,
    feature_name: f.feature_name,
    category: f.category,
    description: f.description,
    execution_count: 1,
    total_tokens: 0,
    total_cost: 0
  }));
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
