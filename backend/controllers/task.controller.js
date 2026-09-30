const {
  Task,
  Prompt,
  File,
  ApiRequest,
  ApiUsage,
  GeneratedResult,
  AiFeature,
  TaskFeature,
  User
} = require('../models');
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

    const filter = !isAdmin && userId ? { user_id: userId } : {};

    const total = await Task.countDocuments(filter);
    const tasks = await Task.find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const taskIds = tasks.map(t => t.task_id);
    const [prompts, requests, results, users] = await Promise.all([
      Prompt.find({ task_id: { $in: taskIds } }).lean(),
      ApiRequest.find({ task_id: { $in: taskIds } }).lean(),
      GeneratedResult.find({ task_id: { $in: taskIds } }).lean(),
      User.find().lean()
    ]);

    const requestIds = requests.map(r => r.request_id);
    const usages = await ApiUsage.find({ request_id: { $in: requestIds } }).lean();

    const promptMap = new Map(prompts.map(p => [p.task_id, p]));
    const requestMap = new Map(requests.map(r => [r.task_id, r]));
    const resultMap = new Map(results.map(res => [res.task_id, res]));
    const userMap = new Map(users.map(u => [u.user_id, u]));
    const usageMap = new Map(usages.map(u => [u.request_id, u]));

    const data = tasks.map(t => {
      const p = promptMap.get(t.task_id) || {};
      const r = requestMap.get(t.task_id) || {};
      const gr = resultMap.get(t.task_id) || {};
      const u = userMap.get(t.user_id) || {};
      const us = usageMap.get(r.request_id) || {};

      return {
        task_id: t.task_id,
        user_id: t.user_id,
        task_type: t.task_type,
        status: t.status,
        created_at: t.created_at,
        completed_at: t.completed_at,
        user_name: u.name || 'User',
        user_email: u.email || '',
        original_prompt: p.original_prompt || '',
        optimization_mode: p.optimization_mode || 'Standard',
        model: r.model || 'claude-sonnet-4-6',
        processing_time_ms: r.processing_time_ms || 0,
        total_tokens: us.total_tokens || 0,
        request_cost: us.request_cost || 0,
        result_id: gr.result_id,
        result_format: gr.result_format || 'markdown'
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

async function getTaskById(req, res, next) {
  try {
    const taskId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const query = { task_id: taskId };
    if (!isAdmin) {
      query.user_id = userId;
    }

    const task = await Task.findOne(query).lean();
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found or unauthorized.' });
    }

    const [prompt, file, request, result, user, taskFeatures] = await Promise.all([
      Prompt.findOne({ task_id: taskId }).lean(),
      File.findOne({ task_id: taskId }).lean(),
      ApiRequest.findOne({ task_id: taskId }).lean(),
      GeneratedResult.findOne({ task_id: taskId }).lean(),
      User.findOne({ user_id: task.user_id }).lean(),
      TaskFeature.find({ task_id: taskId }).lean()
    ]);

    let usage = null;
    if (request) {
      usage = await ApiUsage.findOne({ request_id: request.request_id }).lean();
    }

    let aiFeatures = [];
    if (taskFeatures && taskFeatures.length > 0) {
      const featureIds = taskFeatures.map(tf => tf.feature_id);
      aiFeatures = await AiFeature.find({ feature_id: { $in: featureIds } }).lean();
    }

    const fullTask = {
      task_id: task.task_id,
      user_id: task.user_id,
      task_type: task.task_type,
      status: task.status,
      runtime_options: task.runtime_options,
      created_at: task.created_at,
      completed_at: task.completed_at,
      user_name: user?.name || 'User',
      user_email: user?.email || '',
      original_prompt: prompt?.original_prompt || '',
      optimized_prompt: prompt?.optimized_prompt || '',
      optimization_mode: prompt?.optimization_mode || 'Standard',
      changes_summary: prompt?.changes_summary || '',
      file_id: file?.file_id,
      file_name: file?.file_name,
      file_type: file?.file_type,
      file_size: file?.file_size,
      request_id: request?.request_id,
      model: request?.model || 'claude-sonnet-4-6',
      provider: request?.provider || 'anthropic',
      processing_time_ms: request?.processing_time_ms || 0,
      input_tokens: usage?.input_tokens || 0,
      output_tokens: usage?.output_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
      request_cost: usage?.request_cost || 0,
      cumulative_cost: usage?.cumulative_cost || 0,
      remaining_budget: usage?.remaining_budget || 5.0,
      result_id: result?.result_id,
      result_content: result?.result_text || '',
      result_format: result?.result_format || 'markdown',
      ai_features: aiFeatures
    };

    res.json({
      success: true,
      data: fullTask
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
