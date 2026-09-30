const fs = require('fs');
const path = require('path');
const { GeneratedResult, Task, Prompt, ApiRequest, ApiUsage } = require('../models');
const { generateResultExcel } = require('../services/export.service');

async function getResultByTaskId(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const task = await Task.findOne({ task_id: taskId }).lean();
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    if (!isAdmin && task.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const [gr, prompt, request] = await Promise.all([
      GeneratedResult.findOne({ task_id: taskId }).lean(),
      Prompt.findOne({ task_id: taskId }).lean(),
      ApiRequest.findOne({ task_id: taskId }).lean()
    ]);

    if (!gr) {
      return res.status(404).json({ success: false, error: 'Result not found or not yet generated.' });
    }

    let usage = null;
    if (request) {
      usage = await ApiUsage.findOne({ request_id: request.request_id }).lean();
    }

    res.json({
      success: true,
      data: {
        result_id: gr.result_id,
        task_id: gr.task_id,
        request_id: gr.request_id,
        result_content: gr.result_text,
        result_format: gr.result_format,
        created_at: gr.created_at,
        task_type: task.task_type,
        status: task.status,
        original_prompt: prompt?.original_prompt || '',
        optimized_prompt: prompt?.optimized_prompt || '',
        model: request?.model || 'claude-sonnet-4-6',
        input_tokens: usage?.input_tokens || 0,
        output_tokens: usage?.output_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
        request_cost: usage?.request_cost || 0
      }
    });
  } catch (err) {
    next(err);
  }
}

async function downloadResult(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const format = (req.query.format || 'txt').toLowerCase();
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const task = await Task.findOne({ task_id: taskId }).lean();
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found.' });
    }

    if (!isAdmin && task.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const [gr, request] = await Promise.all([
      GeneratedResult.findOne({ task_id: taskId }).lean(),
      ApiRequest.findOne({ task_id: taskId }).lean()
    ]);

    if (!gr) {
      return res.status(404).json({ success: false, error: 'Result not found.' });
    }

    let usage = null;
    if (request) {
      usage = await ApiUsage.findOne({ request_id: request.request_id }).lean();
    }

    const content = gr.result_text;

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
          taskId,
          taskType: task.task_type,
          model: request?.model || 'claude-sonnet-4-6',
          tokens: usage?.total_tokens || 0,
          cost: usage?.request_cost || 0,
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
