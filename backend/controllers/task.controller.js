const db = require('../config/database');
const { processAiTask } = require('../services/ai.service');

async function processTask(req, res, next) {
  try {
    const userId = req.user.user_id;
    const {
      taskType,
      prompt,
      optimizedPrompt,
      optimizationMode,
      changesSummary,
      fileId,
      runtimeOptions
    } = req.body;

    if (!prompt && !fileId) {
      return res.status(400).json({
        success: false,
        error: 'Either a text prompt or an uploaded file is required for processing.'
      });
    }

    const taskResult = await processAiTask({
      userId,
      taskType: taskType || 'custom',
      prompt,
      optimizedPrompt,
      optimizationMode: optimizationMode || 'Standard',
      changesSummary,
      fileId,
      runtimeOptions: runtimeOptions || {}
    });

    res.json({
      success: true,
      data: taskResult
    });
  } catch (err) {
    next(err);
  }
}

async function getTasks(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = { offset, limit };
    if (!isAdmin) {
      whereClause = 'WHERE t.user_id = @userId';
      params.userId = userId;
    }

    const countSql = `SELECT COUNT(*) AS total FROM dbo.tasks t ${whereClause}`;
    const countRes = await db.query(countSql, params);
    const total = countRes.recordset[0].total;

    const dataSql = `
      SELECT 
        t.task_id, t.user_id, t.task_type, t.status, t.created_at, t.completed_at,
        u.name AS user_name, u.email AS user_email,
        p.original_prompt, p.optimization_mode,
        r.model, r.processing_time_ms,
        us.total_tokens, us.request_cost,
        gr.result_id, gr.result_format
      FROM dbo.tasks t
      JOIN dbo.users u ON t.user_id = u.user_id
      LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
      LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
      ${whereClause}
      ORDER BY t.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;

    const dataRes = await db.query(dataSql, params);

    res.json({
      success: true,
      data: dataRes.recordset,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getTaskById(req, res, next) {
  try {
    const taskId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let authCheck = '';
    const params = { taskId };
    if (!isAdmin) {
      authCheck = 'AND t.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `
      SELECT 
        t.task_id, t.user_id, t.task_type, t.status, t.runtime_options, t.created_at, t.completed_at,
        u.name AS user_name, u.email AS user_email,
        p.original_prompt, p.optimized_prompt, p.optimization_mode, p.changes_summary,
        f.file_id, f.file_name, f.file_type, f.file_size,
        r.request_id, r.model, r.provider, r.processing_time_ms,
        us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost, us.cumulative_cost, us.remaining_budget,
        gr.result_id, gr.result_content, gr.result_format
      FROM dbo.tasks t
      JOIN dbo.users u ON t.user_id = u.user_id
      LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
      LEFT JOIN dbo.files f ON t.task_id = f.task_id
      LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
      WHERE t.task_id = @taskId ${authCheck}
    `;

    const result = await db.query(querySql, params);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found or unauthorized.' });
    }

    const task = result.recordset[0];

    // Load executed features
    const featRes = await db.query(
      `SELECT f.feature_name, f.category, f.description
       FROM dbo.task_features tf
       JOIN dbo.ai_features f ON tf.feature_id = f.feature_id
       WHERE tf.task_id = @taskId`,
      { taskId }
    );
    task.ai_features = featRes.recordset;

    res.json({
      success: true,
      data: task
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  processTask,
  getTasks,
  getTaskById
};
