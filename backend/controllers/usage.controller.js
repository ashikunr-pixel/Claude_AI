const {
  getDashboardSummary,
  getUsageRequests,
  getRequestDetails,
  getChartAnalytics,
  getUsageByUser,
  getUsageByFeature
} = require('../services/usage.service');

async function getSummary(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const apiKeyId = req.query.apiKeyId || req.headers['x-api-key-id'] || null;
    const summary = await getDashboardSummary(userId, role, apiKeyId);

    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
}

async function getRequests(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const apiKeyId = req.query.apiKeyId || req.headers['x-api-key-id'] || null;
    const { search, model, taskType, dateRange, page, limit } = req.query;

    const result = await getUsageRequests({
      userId,
      role,
      search,
      model,
      taskType,
      dateRange,
      apiKeyId,
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '20', 10)
    });

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination
    });
  } catch (err) {
    next(err);
  }
}

async function getRequestById(req, res, next) {
  try {
    const requestId = req.params.id;
    const userId = req.user.user_id;
    const role = req.user.role;

    const details = await getRequestDetails(requestId, userId, role);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Request record not found or access denied.' });
    }

    res.json({
      success: true,
      data: details
    });
  } catch (err) {
    next(err);
  }
}

async function getCharts(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const range = req.query.range || '7days';
    const apiKeyId = req.query.apiKeyId || req.headers['x-api-key-id'] || null;

    const analytics = await getChartAnalytics(userId, role, range, apiKeyId);

    res.json({
      success: true,
      data: analytics
    });
  } catch (err) {
    next(err);
  }
}

async function getByUser(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const apiKeyId = req.query.apiKeyId || req.headers['x-api-key-id'] || null;
    const data = await getUsageByUser(userId, role, apiKeyId);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
}

async function getByFeature(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const apiKeyId = req.query.apiKeyId || req.headers['x-api-key-id'] || null;
    const data = await getUsageByFeature(userId, role, apiKeyId);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getRequests,
  getRequestById,
  getCharts,
  getByUser,
  getByFeature
};

