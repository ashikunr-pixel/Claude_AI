const fs = require('fs');
const path = require('path');
const {
  Task,
  File,
  Prompt,
  ApiRequest,
  GeneratedResult,
  AiFeature,
  TaskFeature,
  getNextSequence
} = require('../models');
const { getAnthropicClient, isApiKeyConfigured, DEFAULT_MODEL } = require('../config/ai');
const { extractUsageTokens } = require('./token.service');
const { checkBudgetSafety } = require('./budget.service');
const { recordRequestUsage } = require('./usage.service');
const { estimateRequestCost } = require('./cost.service');
const { resolveClaudeKey, touchApiKey } = require('./key.service');
const logger = require('../utils/logger');

// Predefined AI Toolkit Tasks with category and mapped AI feature
const TOOLKIT_TASKS = {
  // Text AI
  'ai-chat': { category: 'Text AI', feature: 'AI Chat', systemPrompt: 'You are an intelligent, conversational AI assistant. Engage clearly and helpfully.' },
  'text-generation': { category: 'Text AI', feature: 'Text Generation', systemPrompt: 'You are an articulate, creative writer. Produce high-quality, engaging content.' },
  'summarization': { category: 'Text AI', feature: 'Summarization', systemPrompt: 'You are an expert executive summarizer. Synthesize content concisely with key takeaways.' },
  'rewriting': { category: 'Text AI', feature: 'Rewriting', systemPrompt: 'You are an expert editor. Rewrite content to improve clarity, flow, and elegance.' },
  'grammar': { category: 'Text AI', feature: 'Grammar Improvement', systemPrompt: 'You are a master proofreader. Correct grammatical, spelling, and stylistic errors.' },
  'translation': { category: 'Text AI', feature: 'Translation', systemPrompt: 'You are a professional multilingual translator. Provide faithful, natural translations.' },
  'text-analysis': { category: 'Text AI', feature: 'Text Analysis', systemPrompt: 'You are a linguistic and semantic analyst. Evaluate themes, tone, readability, and structure.' },
  'info-extraction': { category: 'Text AI', feature: 'Information Extraction', systemPrompt: 'You are a precise data extractor. Identify and list entities, dates, metrics, and facts.' },
  'classification': { category: 'Text AI', feature: 'Classification', systemPrompt: 'You are a taxonomy specialist. Categorize the input into distinct, well-defined categories.' },
  'sentiment-analysis': { category: 'Text AI', feature: 'Sentiment Analysis', systemPrompt: 'You are a sentiment intelligence expert. Analyze emotional valence, tone, and subjectivity.' },
  'qa': { category: 'Text AI', feature: 'Question Answering', systemPrompt: 'You are a knowledgeable Q&A specialist. Answer questions directly using the provided context.' },
  'structured-output': { category: 'Text AI', feature: 'Structured Output', systemPrompt: 'You are an information architect. Organize the output into clear, structured markdown tables and sections.' },
  'json-generation': { category: 'Text AI', feature: 'JSON Generation', systemPrompt: 'You are a strict data formatter. Output ONLY valid, parseable JSON conforming to user requirements.' },
  'content-transform': { category: 'Text AI', feature: 'Content Transformation', systemPrompt: 'You are a versatile content transformer. Adapt content between formats, tones, and audiences.' },

  'doc-summary': { category: 'Document AI', feature: 'Document Summarization', systemPrompt: 'You are a document intelligence analyst. Summarize multi-page documents comprehensively.' },
  'doc-qa': { category: 'Document AI', feature: 'Document Q&A', systemPrompt: 'You are a document research assistant. Answer questions strictly grounded in the uploaded document.' },
  'doc-analysis': { category: 'Document AI', feature: 'Document Analysis', systemPrompt: 'You are an auditor and document analyst. Analyze structure, arguments, methodology, and conclusions.' },
  'doc-command-execution': { category: 'Document AI', feature: 'Command & Instruction Execution', systemPrompt: 'You are an autonomous document command analyzer and execution engine. Carefully parse the uploaded text/document, detect all commands, prompts, action requests, or operational instructions embedded within it, and execute each one thoroughly step-by-step with structured, high-clarity output.' },
  'doc-extraction': { category: 'Document AI', feature: 'Document Information Extraction', systemPrompt: 'Extract structured data fields and tables accurately from the uploaded document.' },
  'doc-comparison': { category: 'Document AI', feature: 'Document Comparison', systemPrompt: 'Compare the documents, highlighting differences, commonalities, and key changes.' },

  // Developer AI
  'code-explanation': { category: 'Developer AI', feature: 'Code Explanation', systemPrompt: 'You are a senior software engineer. Explain this code thoroughly, detailing logic and flow.' },
  'code-generation': { category: 'Developer AI', feature: 'Code Generation', systemPrompt: 'You are a principal developer. Write clean, robust, production-ready code with type annotations and error handling.' },
  'code-review': { category: 'Developer AI', feature: 'Code Review', systemPrompt: 'You are a principal engineer conducting a code review. Audit for security vulnerabilities, bugs, performance, and best practices.' },
  'bug-analysis': { category: 'Developer AI', feature: 'Bug/Error Analysis', systemPrompt: 'You are a debugging expert. Analyze the error trace, identify root cause, and provide the fix.' },
  'code-optimization': { category: 'Developer AI', feature: 'Code Optimization', systemPrompt: 'You are a performance optimization specialist. Refactor this code for optimal time and space complexity.' },
  'sql-generation': { category: 'Developer AI', feature: 'Query & Schema Generation', systemPrompt: 'You are a database architect. Write idiomatic, efficient database queries, MongoDB aggregation pipelines, and schema definitions.' },
  'sql-explanation': { category: 'Developer AI', feature: 'Query & Schema Explanation', systemPrompt: 'You are a database performance tuner. Explain query execution flow, indexes, and optimization recommendations.' },
  'doc-generation': { category: 'Developer AI', feature: 'Documentation Generation', systemPrompt: 'You are a technical documentation specialist. Generate clear markdown documentation, API specs, and docstrings.' },

  // Professional AI
  'resume-analysis': { category: 'Professional AI', feature: 'Resume Analysis', systemPrompt: 'You are a certified executive resume coach. Audit resume for ATS compatibility, quantification, and impact.' },
  'resume-improvement': { category: 'Professional AI', feature: 'Resume Improvement', systemPrompt: 'Transform bullet points using the XYZ impact formula (Accomplished [X] as measured by [Y], by doing [Z]).' },
  'cover-letter': { category: 'Professional AI', feature: 'Cover Letter Generation', systemPrompt: 'Craft a compelling, authentic cover letter tailored to the job description and candidate background.' },
  'email-generation': { category: 'Professional AI', feature: 'Email Generation', systemPrompt: 'Write a persuasive, professionally framed executive email with a clear call to action.' },
  'report-generation': { category: 'Professional AI', feature: 'Report Generation', systemPrompt: 'Draft an executive business report with executive summary, methodology, findings, and recommendations.' },
  'meeting-summary': { category: 'Professional AI', feature: 'Meeting Summary', systemPrompt: 'Analyze meeting transcript. Extract: 1. Key Decisions, 2. Discussion Summary, 3. Action Items with owners and deadlines.' },
  'job-description': { category: 'Professional AI', feature: 'Job Description Analysis', systemPrompt: 'Audit job description. Identify core qualifications, hidden expectations, and candidate profile fit.' },

  // Education AI
  'topic-explanation': { category: 'Education AI', feature: 'Topic Explanation', systemPrompt: 'You are an inspiring educator. Explain this concept using first principles, intuitive analogies, and real-world examples.' },
  'study-notes': { category: 'Education AI', feature: 'Study Notes', systemPrompt: 'Generate structured study notes, chapter summaries, key definitions, and revision flash-points.' },
  'question-generation': { category: 'Education AI', feature: 'Question Generation', systemPrompt: 'Generate conceptual, analytical, and application-based questions to test mastery.' },
  'mcq-generation': { category: 'Education AI', feature: 'MCQ Generation', systemPrompt: 'Create multiple-choice questions with 4 options, indicating the correct answer and a thorough explanation for each.' },
  'flashcards': { category: 'Education AI', feature: 'Flashcards', systemPrompt: 'Create a deck of concise front/back flashcards for active recall and spaced repetition.' },
  'exam-prep': { category: 'Education AI', feature: 'Exam Preparation', systemPrompt: 'Design a comprehensive exam preparation guide with practice problems and marking criteria.' },
  'material-qa': { category: 'Education AI', feature: 'Q&A from Uploaded Material', systemPrompt: 'Generate a comprehensive quiz and answer key based strictly on the uploaded educational material.' },

  // Custom AI
  'custom': { category: 'Custom AI', feature: 'Custom AI', systemPrompt: 'You are Claude, an AI assistant built by Anthropic. Fulfill the user task accurately and thoroughly.' }
};

/**
 * Execute real Claude AI processing workflow
 */
async function processAiTask({
  userId,
  apiKeyId = null,
  taskType = 'custom',
  prompt,
  optimizedPrompt = null,
  optimizationMode = 'Standard',
  changesSummary = null,
  fileId = null,
  runtimeOptions = {}
}) {
  const startTime = Date.now();
  const resolvedKey = await resolveClaudeKey(apiKeyId);
  const activeKeyId = resolvedKey.keyId;
  let requestedModel = runtimeOptions.model || DEFAULT_MODEL;
  // Automatically normalize unavailable/legacy models to working default model
  if (requestedModel.includes('3-7-sonnet') || requestedModel.includes('3-5-sonnet') || requestedModel.includes('3-opus') || requestedModel.includes('3-5-haiku')) {
    logger.warn(`Model [${requestedModel}] not supported on this account. Normalizing to default working model [${DEFAULT_MODEL}]`);
    requestedModel = DEFAULT_MODEL;
  }
  let model = requestedModel;
  const maxOutputTokens = parseInt(runtimeOptions.maxOutputTokens || '1024', 10);
  const outputFormat = runtimeOptions.outputFormat || 'markdown';
  const duplicateRemoval = Boolean(runtimeOptions.duplicateContentRemoval);
  const budgetProtection = runtimeOptions.budgetProtection !== undefined ? Boolean(runtimeOptions.budgetProtection) : true;

  // 1. Fetch File Content if attached
  let fileText = '';
  let attachedFile = null;
  if (fileId) {
    const fileRes = await File.findOne({ file_id: Number(fileId) }).lean();
    if (fileRes) {
      attachedFile = fileRes;
      fileText = attachedFile.extracted_text || '';
    }
  }

  // 2. Resolve prompt to send (use in-file command analysis if prompt omitted)
  let activePrompt = (optimizedPrompt || prompt || '').trim();
  if (!activePrompt) {
    if (fileText) {
      activePrompt = 'Analyze the uploaded file, extract all commands, directives, tasks, or instructions specified within it, and execute each one step-by-step with thorough results.';
    } else {
      throw new Error('A prompt, instruction, or uploaded document is required for AI processing.');
    }
  }

  // 3. Construct Full Context Prompt
  let constructedContent = activePrompt;
  if (fileText) {
    constructedContent = `User Prompt / Instructions:
${activePrompt}

--- ATTACHED DOCUMENT CONTENT (${attachedFile ? attachedFile.file_name : 'Document'}) ---
${fileText}
--- END DOCUMENT CONTENT ---`;
  }

  // 4. Token & Cost Pre-check
  const estimatedInputTokens = Math.ceil(constructedContent.length / 3.8);
  const estimatedCostData = await estimateRequestCost(model, estimatedInputTokens, maxOutputTokens);
  const estimatedCost = estimatedCostData.estimatedTotalCost;

  // 5. Application Budget Safety Check ($5 Safety Budget)
  const budgetCheck = await checkBudgetSafety(estimatedCost, budgetProtection, activeKeyId);
  if (!budgetCheck.allowed && budgetProtection) {
    const err = new Error(budgetCheck.message);
    err.statusCode = 402; // Payment Required / Budget Exceeded
    throw err;
  }

  // 6. Create Task record in MongoDB Atlas
  const taskId = await getNextSequence('taskId');
  await Task.create({
    task_id: taskId,
    user_id: userId,
    task_type: taskType,
    status: 'PROCESSING',
    runtime_options: JSON.stringify({
      model,
      maxOutputTokens,
      outputFormat,
      duplicateRemoval,
      budgetProtection,
      optimizationMode
    }),
    created_at: new Date()
  });

  // Link file to task if provided
  if (fileId) {
    await File.findOneAndUpdate({ file_id: fileId }, { task_id: taskId });
  }

  // Record Prompt record in MongoDB Atlas
  const promptId = await getNextSequence('promptId');
  await Prompt.create({
    prompt_id: promptId,
    task_id: taskId,
    original_prompt: prompt || activePrompt,
    optimized_prompt: optimizedPrompt || prompt || activePrompt,
    optimization_mode: optimizationMode || 'Standard',
    changes_summary: changesSummary,
    created_at: new Date()
  });

  // Create API Request record in MongoDB Atlas
  const requestId = await getNextSequence('requestId');
  await ApiRequest.create({
    request_id: requestId,
    task_id: taskId,
    user_id: userId,
    api_key_id: activeKeyId,
    model,
    provider: 'anthropic',
    status: 'PROCESSING',
    created_at: new Date()
  });

  // Track executed AI features
  const taskDefinition = TOOLKIT_TASKS[taskType] || TOOLKIT_TASKS['custom'];
  const executedFeatures = new Set([taskDefinition.feature]);

  if (optimizationMode && optimizationMode !== 'Standard') {
    executedFeatures.add('Prompt Optimization');
  }
  if (fileId) {
    executedFeatures.add('File Text Extraction');
  }
  if (duplicateRemoval) {
    executedFeatures.add('Duplicate Content Removal');
  }
  if (outputFormat === 'json' || taskType === 'json-generation') {
    executedFeatures.add('JSON Generation');
  } else if (outputFormat === 'markdown') {
    executedFeatures.add('Structured Output');
  }

  // 7. Execute Claude API Request
  let responseText = '';
  let usageTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  let processingTimeMs = 0;

  try {
    const client = getAnthropicClient(resolvedKey.apiKey);
    let systemInstruction = taskDefinition.systemPrompt;

    if (outputFormat === 'json') {
      systemInstruction += '\nCRITICAL REQUIREMENT: Respond strictly in valid JSON format without enclosing code fences.';
    } else if (outputFormat === 'markdown') {
      systemInstruction += '\nFormat the response using clean, semantic markdown (headings, bold, lists, tables).';
    }

    let messageResponse;
    try {
      messageResponse = await client.messages.create({
        model,
        max_tokens: maxOutputTokens,
        system: systemInstruction,
        messages: [
          {
            role: 'user',
            content: constructedContent
          }
        ]
      });
    } catch (modelErr) {
      if ((modelErr.status === 404 || modelErr.message?.includes('not_found_error')) && model !== DEFAULT_MODEL) {
        logger.warn(`Model [${model}] returned 404 not found. Automatically retrying with working default model [${DEFAULT_MODEL}]...`);
        model = DEFAULT_MODEL;
        messageResponse = await client.messages.create({
          model,
          max_tokens: maxOutputTokens,
          system: systemInstruction,
          messages: [
            {
              role: 'user',
              content: constructedContent
            }
          ]
        });
      } else {
        throw modelErr;
      }
    }

    processingTimeMs = Date.now() - startTime;

    // Extract Claude response content
    if (messageResponse.content && messageResponse.content.length > 0) {
      responseText = messageResponse.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }

    // Extract exact usage from Claude response
    usageTokens = extractUsageTokens(messageResponse.usage);

  } catch (apiErr) {
    processingTimeMs = Date.now() - startTime;
    logger.error(`Claude API error for task ${taskId}:`, apiErr);

    // Record failure in DB
    await Task.updateOne(
      { task_id: taskId },
      { $set: { status: 'FAILED', completed_at: new Date() } }
    ).catch(() => {});
    await ApiRequest.updateOne(
      { request_id: requestId },
      { $set: { status: 'FAILED', processing_time_ms: processingTimeMs, error_message: apiErr.message || 'Claude API execution error' } }
    ).catch(() => {});

    throw apiErr;
  }

  // 8. Record Usage & Calculate Exact Cost
  const usageRecord = await recordRequestUsage({
    requestId,
    apiKeyId: activeKeyId,
    model,
    inputTokens: usageTokens.inputTokens,
    outputTokens: usageTokens.outputTokens,
    cacheCreationTokens: usageTokens.cacheCreationTokens,
    cacheReadTokens: usageTokens.cacheReadTokens,
    processingTimeMs,
    status: 'SUCCESS'
  });

  if (activeKeyId) {
    touchApiKey(activeKeyId).catch(err => logger.warn(`Error touching apiKey ${activeKeyId}:`, err.message));
  }

  // 9. Save Generated Result in MongoDB Atlas
  const resultId = await getNextSequence('resultId');
  let resultFilePath = null;
  try {
    const ext = outputFormat === 'json' ? 'json' : outputFormat === 'markdown' ? 'md' : 'txt';
    resultFilePath = path.join(__dirname, '../../results', `result_task_${taskId}.${ext}`);
    fs.writeFileSync(resultFilePath, responseText, 'utf-8');
  } catch (fsErr) {
    logger.warn(`Could not write result file to disk: ${fsErr.message}`);
  }

  await GeneratedResult.create({
    result_id: resultId,
    task_id: taskId,
    result_text: responseText,
    result_format: outputFormat,
    token_count: usageTokens.totalTokens,
    cost_usd: usageRecord.requestCost,
    storage_path: resultFilePath,
    created_at: new Date()
  });

  // 10. Persist Executed AI Features
  for (const featName of executedFeatures) {
    try {
      const featDoc = await AiFeature.findOne({ feature_name: featName });
      if (featDoc) {
        const tfId = await getNextSequence('taskFeatureId');
        await TaskFeature.create({
          task_feature_id: tfId,
          task_id: taskId,
          feature_id: featDoc.feature_id
        });
      }
    } catch { }
  }

  // 11. Mark Task Completed in MongoDB Atlas
  await Task.findOneAndUpdate(
    { task_id: taskId },
    { status: 'COMPLETED', completed_at: new Date() }
  );

  // 12. Mark ApiRequest Completed in MongoDB Atlas
  await ApiRequest.findOneAndUpdate(
    { request_id: requestId },
    { status: 'SUCCESS', processing_time_ms: processingTimeMs }
  );

  // 13. Audit Log
  await logger.audit(userId, 'AI_PROCESS_TASK', 'TASK', taskId, {
    model,
    taskType,
    tokens: usageTokens.totalTokens,
    cost: usageRecord.requestCost
  }).catch(() => { });

  return {
    taskId,
    requestId,
    resultId,
    taskType,
    model,
    result: responseText,
    resultFormat: outputFormat,
    usage: {
      inputTokens: usageTokens.inputTokens,
      outputTokens: usageTokens.outputTokens,
      totalTokens: usageTokens.totalTokens,
      cacheCreationTokens: usageTokens.cacheCreationTokens,
      cacheReadTokens: usageTokens.cacheReadTokens
    },
    cost: {
      requestCost: usageRecord.requestCost,
      cumulativeCost: usageRecord.cumulativeCost,
      remainingBudget: usageRecord.remainingBudget
    },
    processingTimeMs,
    featuresUsed: Array.from(executedFeatures),
    completedAt: new Date().toISOString()
  };
}

module.exports = {
  processAiTask,
  TOOLKIT_TASKS
};
