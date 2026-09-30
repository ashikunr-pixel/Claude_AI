const { Prompt, Task, ApiRequest, ApiUsage, GeneratedResult } = require('../models');
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

    const filter = {};
    if (search) {
      filter.$or = [
        { original_prompt: { $regex: search, $options: 'i' } },
        { optimized_prompt: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Prompt.countDocuments(filter);
    const prompts = await Prompt.find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const taskIds = prompts.map(p => p.task_id);
    const [tasks, requests, results] = await Promise.all([
      Task.find({ task_id: { $in: taskIds } }).lean(),
      ApiRequest.find({ task_id: { $in: taskIds } }).lean(),
      GeneratedResult.find({ task_id: { $in: taskIds } }).lean()
    ]);

    const requestIds = requests.map(r => r.request_id);
    const usages = await ApiUsage.find({ request_id: { $in: requestIds } }).lean();

    const taskMap = new Map(tasks.map(t => [t.task_id, t]));
    const requestMap = new Map(requests.map(r => [r.task_id, r]));
    const resultMap = new Map(results.map(res => [res.task_id, res]));
    const usageMap = new Map(usages.map(u => [u.request_id, u]));

    const data = prompts.map(p => {
      const t = taskMap.get(p.task_id) || {};
      const r = requestMap.get(p.task_id) || {};
      const gr = resultMap.get(p.task_id) || {};
      const us = usageMap.get(r.request_id) || {};

      return {
        prompt_id: p.prompt_id,
        task_id: p.task_id,
        original_prompt: p.original_prompt,
        optimized_prompt: p.optimized_prompt,
        optimization_mode: p.optimization_mode,
        changes_summary: p.changes_summary,
        created_at: p.created_at,
        task_type: t.task_type || 'General',
        model: r.model || 'claude-sonnet-4-6',
        total_tokens: us.total_tokens || 0,
        request_cost: us.request_cost || 0,
        result_id: gr.result_id
      };
    });

    res.json({
      success: true,
      data,
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
    const promptId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const prompt = await Prompt.findOne({ prompt_id: promptId }).lean();
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found or unauthorized.' });
    }

    const [task, request, result] = await Promise.all([
      Task.findOne({ task_id: prompt.task_id }).lean(),
      ApiRequest.findOne({ task_id: prompt.task_id }).lean(),
      GeneratedResult.findOne({ task_id: prompt.task_id }).lean()
    ]);

    if (!isAdmin && task && task.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    let usage = null;
    if (request) {
      usage = await ApiUsage.findOne({ request_id: request.request_id }).lean();
    }

    res.json({
      success: true,
      data: {
        prompt_id: prompt.prompt_id,
        task_id: prompt.task_id,
        original_prompt: prompt.original_prompt,
        optimized_prompt: prompt.optimized_prompt,
        optimization_mode: prompt.optimization_mode,
        changes_summary: prompt.changes_summary,
        created_at: prompt.created_at,
        task_type: task?.task_type || 'General',
        model: request?.model || 'claude-sonnet-4-6',
        input_tokens: usage?.input_tokens || 0,
        output_tokens: usage?.output_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
        request_cost: usage?.request_cost || 0,
        result_content: result?.result_text || ''
      }
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
