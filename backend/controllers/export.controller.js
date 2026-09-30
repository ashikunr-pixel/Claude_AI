const db = require('../config/database');
const { generateUsageExcel, generateCompleteMasterExcel } = require('../services/export.service');
const { getBudgetStatus } = require('../services/budget.service');

/**
 * Export usage history as JSON
 */
async function exportUsageJson(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let userFilter = '';
    const params = {};
    if (!isAdmin) {
      userFilter = 'WHERE r.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `
      SELECT 
        r.request_id, r.created_at, r.model, r.provider, r.status, r.processing_time_ms,
        t.task_id, t.task_type,
        u.name AS user_name,
        p.original_prompt,
        us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost, us.cumulative_cost, us.remaining_budget
      FROM dbo.api_requests r
      JOIN dbo.users u ON r.user_id = u.user_id
      LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
      LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      ${userFilter}
      ORDER BY r.created_at DESC
    `;

    const result = await db.query(querySql, params);
    const dateStr = new Date().toISOString().substring(0, 10);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ai_usage_report_${dateStr}.json"`);
    res.send(JSON.stringify(result.recordset, null, 2));
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

    let userFilter = '';
    const params = {};
    if (!isAdmin) {
      userFilter = 'WHERE t.user_id = @userId';
      params.userId = userId;
    }

    const tasksRes = await db.query(`SELECT * FROM dbo.tasks t ${userFilter} ORDER BY task_id DESC`, params);
    const usageRes = await db.query(
      `SELECT u.* FROM dbo.api_usage u JOIN dbo.api_requests r ON u.request_id = r.request_id ${!isAdmin ? 'WHERE r.user_id = @userId' : ''}`,
      params
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      scope: isAdmin ? 'COMPLETE_SYSTEM' : 'USER_WORKSPACE',
      budget,
      tasks: tasksRes.recordset,
      usage: usageRes.recordset
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
