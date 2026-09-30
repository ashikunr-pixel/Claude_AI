const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { generateResultExcel } = require('../services/export.service');

async function getResultByTaskId(req, res, next) {
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
        gr.result_id, gr.task_id, gr.request_id, gr.result_content, gr.result_format, gr.created_at,
        t.task_type, t.status,
        p.original_prompt, p.optimized_prompt,
        r.model,
        us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost
      FROM dbo.generated_results gr
      JOIN dbo.tasks t ON gr.task_id = t.task_id
      LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
      LEFT JOIN dbo.api_requests r ON gr.request_id = r.request_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      WHERE gr.task_id = @taskId ${authCheck}
    `;

    const result = await db.query(querySql, params);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Result not found or access denied.' });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
}

async function downloadResult(req, res, next) {
  try {
    const taskId = req.params.id;
    const format = (req.query.format || 'txt').toLowerCase();
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let authCheck = '';
    const params = { taskId };
    if (!isAdmin) {
      authCheck = 'AND t.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `
      SELECT gr.result_content, gr.result_format, t.task_id, t.task_type, r.model, us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost
      FROM dbo.generated_results gr
      JOIN dbo.tasks t ON gr.task_id = t.task_id
      LEFT JOIN dbo.api_requests r ON gr.request_id = r.request_id
      LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
      WHERE gr.task_id = @taskId ${authCheck}
    `;

    const result = await db.query(querySql, params);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Result not found or unauthorized.' });
    }

    const row = result.recordset[0];
    const content = row.result_content;

    if (format === 'xlsx' || format === 'excel') {
      const workbook = await generateResultExcel(taskId, userId, req.user.role);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="result_task_${taskId}.xlsx"`);
      return await workbook.xlsx.write(res);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="result_task_${taskId}.json"`);
      let jsonPayload;
      try {
        jsonPayload = JSON.parse(content);
      } catch {
        jsonPayload = {
          taskId: row.task_id,
          taskType: row.task_type,
          model: row.model,
          tokens: row.total_tokens,
          cost: row.request_cost,
          result: content
        };
      }
      return res.send(JSON.stringify(jsonPayload, null, 2));
    }

    if (format === 'md' || format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="result_task_${taskId}.md"`);
      return res.send(content);
    }

    // Default TXT
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="result_task_${taskId}.txt"`);
    return res.send(content);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getResultByTaskId,
  downloadResult
};
