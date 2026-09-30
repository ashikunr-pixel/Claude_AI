const db = require('../config/database');
const { optimizePrompt } = require('../services/promptOptimizer.service');

async function handleOptimizePrompt(req, res, next) {
  try {
    const { prompt, mode } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'A valid text prompt is required.' });
    }

    const optimizationResult = await optimizePrompt(prompt, mode || 'Optimized');

    res.json({
      success: true,
      data: optimizationResult
    });
  } catch (err) {
    next(err);
  }
}

async function getPrompts(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = { offset, limit };

    if (!isAdmin) {
      conditions.push('t.user_id = @userId');
      params.userId = userId;
    }

    if (search) {
      conditions.push('(p.original_prompt LIKE @search OR p.optimized_prompt LIKE @search)');
      params.search = `%${search}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*) AS total
      FROM dbo.prompts p
      JOIN dbo.tasks t ON p.task_id = t.task_id
      ${whereClause}
    `;
    const countRes = await db.query(countSql, params);
    const total = countRes.recordset[0].total;

    const dataSql = `
      SELECT 
        p.prompt_id, p.task_id, p.original_prompt, p.optimized_prompt, 
        p.optimization_mode, p.changes_summary, p.created_at,
        t.task_type,
        r.model,
        us.total_tokens, us.request_cost,
        gr.result_id
      FROM dbo.prompts p
      JOIN dbo.tasks t ON p.task_id = t.task_id
      LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
      ${whereClause}
      ORDER BY p.created_at DESC
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

async function getPromptById(req, res, next) {
  try {
    const promptId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let authCheck = '';
    const params = { promptId };
    if (!isAdmin) {
      authCheck = 'AND t.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `
      SELECT 
        p.prompt_id, p.task_id, p.original_prompt, p.optimized_prompt, 
        p.optimization_mode, p.changes_summary, p.created_at,
        t.task_type,
        r.model,
        us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost,
        gr.result_content
      FROM dbo.prompts p
      JOIN dbo.tasks t ON p.task_id = t.task_id
      LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
      WHERE p.prompt_id = @promptId ${authCheck}
    `;

    const result = await db.query(querySql, params);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Prompt not found or unauthorized.' });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleOptimizePrompt,
  getPrompts,
  getPromptById
};
