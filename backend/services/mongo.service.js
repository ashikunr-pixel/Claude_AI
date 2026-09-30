const { isMongoConnected } = require('../config/mongo');
const {
  User,
  Task,
  File,
  Prompt,
  ApiRequest,
  ApiUsage,
  GeneratedResult,
  AuditLog,
  getNextSequence
} = require('../models');

async function syncUser({ userId, name, email, passwordHash, role }) {
  if (!isMongoConnected()) return;
  try {
    await User.findOneAndUpdate(
      { email },
      {
        user_id: userId,
        name,
        email,
        password_hash: passwordHash,
        role: role || 'USER',
        created_at: new Date()
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync user:', err.message);
  }
}

async function syncTask({ taskId, userId, taskType, status, runtimeOptions, completedAt }) {
  if (!isMongoConnected()) return;
  try {
    await Task.findOneAndUpdate(
      { task_id: taskId },
      {
        task_id: taskId,
        user_id: userId,
        task_type: taskType,
        status: status || 'PROCESSING',
        runtime_options: typeof runtimeOptions === 'string' ? runtimeOptions : JSON.stringify(runtimeOptions || {}),
        completed_at: completedAt || null
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync task:', err.message);
  }
}

async function syncFile({ fileId, userId, taskId, fileName, fileType, fileSize, storagePath, extractedText }) {
  if (!isMongoConnected()) return;
  try {
    await File.findOneAndUpdate(
      { file_id: fileId },
      {
        file_id: fileId,
        user_id: userId,
        task_id: taskId,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        storage_path: storagePath,
        extracted_text: extractedText
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync file:', err.message);
  }
}

async function syncPrompt({ promptId, taskId, originalPrompt, optimizedPrompt, optimizationMode, changesSummary, tokenDifference }) {
  if (!isMongoConnected()) return;
  try {
    await Prompt.findOneAndUpdate(
      { prompt_id: promptId || taskId },
      {
        prompt_id: promptId || taskId,
        task_id: taskId,
        original_prompt: originalPrompt,
        optimized_prompt: optimizedPrompt,
        optimization_mode: optimizationMode || 'Standard',
        changes_summary: changesSummary,
        token_difference: tokenDifference || 0
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync prompt:', err.message);
  }
}

async function syncApiRequest({ requestId, taskId, userId, model, provider, status, processingTimeMs, errorMessage }) {
  if (!isMongoConnected()) return;
  try {
    await ApiRequest.findOneAndUpdate(
      { request_id: requestId },
      {
        request_id: requestId,
        task_id: taskId,
        user_id: userId,
        model,
        provider: provider || 'anthropic',
        status: status || 'PROCESSING',
        processing_time_ms: processingTimeMs || 0,
        error_message: errorMessage || null
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync api request:', err.message);
  }
}

async function syncApiUsage({ usageId, requestId, inputTokens, outputTokens, totalTokens, cacheCreationTokens, cacheReadTokens, requestCost, cumulativeCost, remainingBudget }) {
  if (!isMongoConnected()) return;
  try {
    await ApiUsage.findOneAndUpdate(
      { request_id: requestId },
      {
        usage_id: usageId,
        request_id: requestId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cache_creation_tokens: cacheCreationTokens || 0,
        cache_read_tokens: cacheReadTokens || 0,
        request_cost: requestCost,
        cumulative_cost: cumulativeCost,
        remaining_budget: remainingBudget
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync api usage:', err.message);
  }
}

async function syncGeneratedResult({ resultId, taskId, resultText, resultFormat, tokenCount, costUsd, storagePath }) {
  if (!isMongoConnected()) return;
  try {
    await GeneratedResult.findOneAndUpdate(
      { task_id: taskId },
      {
        result_id: resultId,
        task_id: taskId,
        result_text: resultText,
        result_format: resultFormat || 'markdown',
        token_count: tokenCount || 0,
        cost_usd: costUsd || 0,
        storage_path: storagePath || null
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync generated result:', err.message);
  }
}

async function syncAuditLog({ logId, userId, action, resourceType, resourceId, details, ipAddress }) {
  if (!isMongoConnected()) return;
  try {
    const finalLogId = logId || (await getNextSequence('log_id'));
    await AuditLog.create({
      log_id: finalLogId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: typeof details === 'string' ? details : JSON.stringify(details || {}),
      ip_address: ipAddress || '127.0.0.1'
    });
  } catch (err) {
    console.warn('[Mongo Sync] Failed to sync audit log:', err.message);
  }
}

module.exports = {
  syncUser,
  syncTask,
  syncFile,
  syncPrompt,
  syncApiRequest,
  syncApiUsage,
  syncGeneratedResult,
  syncAuditLog
};
