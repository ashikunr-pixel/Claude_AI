const { ApiRequest, ApiUsage, Task, User, Prompt } = require('../models');
const { generateUsageExcel, generateCompleteMasterExcel } = require('../services/export.service');
const { getBudgetStatus } = require('../services/budget.service');

/**
 * Export usage history as JSON
 */
async function exportUsageJson(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const query = !isAdmin && userId ? { user_id: userId } : {};

    const requests = await ApiRequest.find(query).sort({ created_at: -1 }).lean();
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

    const data = requests.map(r => {
      const us = usageMap.get(r.request_id) || {};
      const t = taskMap.get(r.task_id) || {};
      const p = promptMap.get(r.task_id) || {};
      const u = userMap.get(r.user_id) || {};

      return {
        request_id: r.request_id,
        created_at: r.created_at,
        model: r.model,
        provider: r.provider,
        status: r.status,
        processing_time_ms: r.processing_time_ms,
        task_id: r.task_id,
        task_type: t.task_type || 'General',
        user_name: u.name || 'User',
        original_prompt: p.original_prompt || '',
        input_tokens: us.input_tokens || 0,
        output_tokens: us.output_tokens || 0,
        total_tokens: us.total_tokens || 0,
        request_cost: us.request_cost || 0,
        cumulative_cost: us.cumulative_cost || 0,
        remaining_budget: us.remaining_budget || 5.0
      };
    });

    const dateStr = new Date().toISOString().substring(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ai_usage_report_${dateStr}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
}

/**
 * Export usage history as Excel
 */
async function exportUsageExcel(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const workbook = await generateUsageExcel(userId, role);
    const dateStr = new Date().toISOString().substring(0, 10);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ai_usage_report_${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
  } catch (err) {
    next(err);
  }
}

/**
 * Export complete multi-sheet Excel report
 */
async function exportCompleteReportExcel(req, res, next) {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const workbook = await generateCompleteMasterExcel(userId, role);
    const dateStr = new Date().toISOString().substring(0, 10);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="complete_ai_report_${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
  } catch (err) {
    next(err);
  }
}

/**
 * Export complete system data as JSON (Admin only or scoped user data)
 */
async function exportCompleteReportJson(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;
    const dateStr = new Date().toISOString().substring(0, 10);

    const budget = await getBudgetStatus();
    const taskFilter = !isAdmin && userId ? { user_id: userId } : {};

    const [tasks, usages] = await Promise.all([
      Task.find(taskFilter).sort({ task_id: -1 }).lean(),
      ApiUsage.find().lean()
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      scope: isAdmin ? 'COMPLETE_SYSTEM' : 'USER_WORKSPACE',
      budget,
      tasks,
      usage: usages
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="complete_ai_report_${dateStr}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  exportUsageJson,
  exportUsageExcel,
  exportCompleteReportExcel,
  exportCompleteReportJson
};
