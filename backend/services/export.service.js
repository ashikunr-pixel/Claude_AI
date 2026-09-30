const ExcelJS = require('exceljs');
const {
  Task,
  ApiRequest,
  ApiUsage,
  Prompt,
  File,
  GeneratedResult,
  ModelPricing,
  AiFeature,
  User
} = require('../models');
const { getBudgetStatus } = require('./budget.service');

// Helper to style an Excel table header row
function applyHeaderStyle(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' } // Indigo accent
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'medium', color: { argb: 'FF4338CA' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
  });
  row.height = 28;
}

// Auto-fit column widths
function autoFitColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLength && val.length < 60) {
        maxLength = val.length + 3;
      }
    });
    column.width = maxLength;
  });
}

/**
 * Generate Excel workbook for a single task result
 */
async function generateResultExcel(taskId, userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const numericTaskId = parseInt(taskId, 10);

  const query = { task_id: numericTaskId };
  if (!isAdmin && userId) {
    query.user_id = userId;
  }

  const task = await Task.findOne(query).lean();
  if (!task) {
    throw new Error('Task result not found or access denied.');
  }

  const [prompt, request, gr] = await Promise.all([
    Prompt.findOne({ task_id: numericTaskId }).lean(),
    ApiRequest.findOne({ task_id: numericTaskId }).lean(),
    GeneratedResult.findOne({ task_id: numericTaskId }).lean()
  ]);

  let usage = null;
  if (request) {
    usage = await ApiUsage.findOne({ request_id: request.request_id }).lean();
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Claude AI Platform';
  workbook.created = new Date();

  // Sheet 1: Result Content
  const resultSheet = workbook.addWorksheet('Result Output');
  resultSheet.columns = [
    { header: 'Attribute', key: 'attr', width: 25 },
    { header: 'Details', key: 'val', width: 80 }
  ];
  applyHeaderStyle(resultSheet.getRow(1));

  resultSheet.addRow({ attr: 'Task ID', val: task.task_id });
  resultSheet.addRow({ attr: 'Task Type', val: task.task_type });
  resultSheet.addRow({ attr: 'Model', val: request?.model || 'N/A' });
  resultSheet.addRow({ attr: 'Status', val: task.status });
  resultSheet.addRow({ attr: 'Input Tokens', val: usage?.input_tokens || 0 });
  resultSheet.addRow({ attr: 'Output Tokens', val: usage?.output_tokens || 0 });
  resultSheet.addRow({ attr: 'Total Tokens', val: usage?.total_tokens || 0 });
  resultSheet.addRow({ attr: 'Request Cost ($)', val: usage?.request_cost || 0 });
  resultSheet.addRow({ attr: 'Original Prompt', val: prompt?.original_prompt || '' });
  resultSheet.addRow({ attr: 'Result Content', val: gr?.result_text || '' });

  resultSheet.getColumn(2).alignment = { wrapText: true };

  return workbook;
}

/**
 * Generate Excel usage report
 */
async function generateUsageExcel(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const query = !isAdmin && userId ? { user_id: userId } : {};

  const requests = await ApiRequest.find(query).sort({ created_at: -1 }).lean();
  const requestIds = requests.map(r => r.request_id);
  const taskIds = requests.map(r => r.task_id);
  const userIds = [...new Set(requests.map(r => r.user_id))];

  const [usages, tasks, users] = await Promise.all([
    ApiUsage.find({ request_id: { $in: requestIds } }).lean(),
    Task.find({ task_id: { $in: taskIds } }).lean(),
    User.find({ user_id: { $in: userIds } }).lean()
  ]);

  const usageMap = new Map(usages.map(u => [u.request_id, u]));
  const taskMap = new Map(tasks.map(t => [t.task_id, t]));
  const userMap = new Map(users.map(u => [u.user_id, u]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('API Usage Report');

  sheet.columns = [
    { header: 'Request ID', key: 'request_id', width: 14 },
    { header: 'Date & Time (UTC)', key: 'created_at', width: 22 },
    { header: 'User', key: 'user_name', width: 20 },
    { header: 'Task Type', key: 'task_type', width: 22 },
    { header: 'Model', key: 'model', width: 28 },
    { header: 'Input Tokens', key: 'input_tokens', width: 15 },
    { header: 'Output Tokens', key: 'output_tokens', width: 15 },
    { header: 'Total Tokens', key: 'total_tokens', width: 15 },
    { header: 'Cost (USD)', key: 'request_cost', width: 16 },
    { header: 'Cumulative (USD)', key: 'cumulative_cost', width: 18 },
    { header: 'Remaining ($)', key: 'remaining_budget', width: 16 },
    { header: 'Time (ms)', key: 'processing_time_ms', width: 14 },
    { header: 'Status', key: 'status', width: 14 }
  ];

  applyHeaderStyle(sheet.getRow(1));

  requests.forEach((r) => {
    const us = usageMap.get(r.request_id) || {};
    const t = taskMap.get(r.task_id) || {};
    const u = userMap.get(r.user_id) || {};

    const row = sheet.addRow({
      request_id: r.request_id,
      created_at: new Date(r.created_at).toISOString().replace('T', ' ').substring(0, 19),
      user_name: u.name || 'User',
      task_type: t.task_type || 'Custom',
      model: r.model,
      input_tokens: us.input_tokens || 0,
      output_tokens: us.output_tokens || 0,
      total_tokens: us.total_tokens || 0,
      request_cost: us.request_cost ? Number(us.request_cost) : 0,
      cumulative_cost: us.cumulative_cost ? Number(us.cumulative_cost) : 0,
      remaining_budget: us.remaining_budget ? Number(us.remaining_budget) : 5,
      processing_time_ms: r.processing_time_ms || 0,
      status: r.status
    });

    row.getCell('request_cost').numFmt = '$#,##0.000000';
    row.getCell('cumulative_cost').numFmt = '$#,##0.000000';
    row.getCell('remaining_budget').numFmt = '$#,##0.00';
  });

  return workbook;
}

/**
 * Generate Complete Master 10-Sheet Excel Report
 */
async function generateCompleteMasterExcel(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Claude AI Platform Enterprise';
  workbook.created = new Date();

  // 1. Summary Sheet
  const budget = await getBudgetStatus();
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'System Metric', key: 'metric', width: 35 },
    { header: 'Value', key: 'val', width: 45 }
  ];
  applyHeaderStyle(summarySheet.getRow(1));

  const usages = await ApiUsage.find().lean();
  let totalIn = 0;
  let totalOut = 0;
  let totalAll = 0;
  let totalCost = 0;
  usages.forEach(u => {
    totalIn += (u.input_tokens || 0);
    totalOut += (u.output_tokens || 0);
    totalAll += (u.total_tokens || 0);
    totalCost += (u.request_cost || 0);
  });

  summarySheet.addRow({ metric: 'Configured Application Safety Budget', val: `$${budget.budgetUsd.toFixed(2)} USD` });
  summarySheet.addRow({ metric: 'Cumulative Tracked Spending', val: `$${budget.cumulativeSpent.toFixed(6)} USD` });
  summarySheet.addRow({ metric: 'Remaining Application Budget', val: `$${budget.remainingBudget.toFixed(6)} USD` });
  summarySheet.addRow({ metric: 'Budget Utilization (%)', val: `${budget.usagePercentage.toFixed(2)}%` });
  summarySheet.addRow({ metric: 'Total API Requests Completed', val: usages.length });
  summarySheet.addRow({ metric: 'Total Input Tokens Consumed', val: totalIn });
  summarySheet.addRow({ metric: 'Total Output Tokens Generated', val: totalOut });
  summarySheet.addRow({ metric: 'Total Tokens Tracked', val: totalAll });
  summarySheet.addRow({ metric: 'Report Generated UTC', val: new Date().toISOString() });
  summarySheet.addRow({ metric: 'Report Scope', val: isAdmin ? 'Full Enterprise System' : 'User Private Workspace' });

  // 2. Tasks Sheet
  const tasksSheet = workbook.addWorksheet('Tasks');
  tasksSheet.columns = [
    { header: 'Task ID', key: 'task_id', width: 12 },
    { header: 'Task Type', key: 'task_type', width: 22 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Created At (UTC)', key: 'created_at', width: 22 },
    { header: 'Completed At (UTC)', key: 'completed_at', width: 22 }
  ];
  applyHeaderStyle(tasksSheet.getRow(1));

  const taskFilter = !isAdmin && userId ? { user_id: userId } : {};
  const tasks = await Task.find(taskFilter).sort({ task_id: -1 }).lean();
  tasks.forEach(t => tasksSheet.addRow({
    task_id: t.task_id,
    task_type: t.task_type,
    status: t.status,
    created_at: t.created_at ? new Date(t.created_at).toISOString() : '',
    completed_at: t.completed_at ? new Date(t.completed_at).toISOString() : ''
  }));

  // 3. API Requests Sheet
  const reqSheet = workbook.addWorksheet('API Requests');
  reqSheet.columns = [
    { header: 'Request ID', key: 'request_id', width: 14 },
    { header: 'Task ID', key: 'task_id', width: 12 },
    { header: 'Model', key: 'model', width: 26 },
    { header: 'Provider', key: 'provider', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Time (ms)', key: 'processing_time_ms', width: 14 },
    { header: 'Created At (UTC)', key: 'created_at', width: 22 }
  ];
  applyHeaderStyle(reqSheet.getRow(1));

  const requests = await ApiRequest.find(taskFilter).sort({ request_id: -1 }).lean();
  requests.forEach(r => reqSheet.addRow({
    request_id: r.request_id,
    task_id: r.task_id,
    model: r.model,
    provider: r.provider,
    status: r.status,
    processing_time_ms: r.processing_time_ms,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : ''
  }));

  // 4. Prompts Sheet
  const promptsSheet = workbook.addWorksheet('Prompts');
  promptsSheet.columns = [
    { header: 'Prompt ID', key: 'prompt_id', width: 12 },
    { header: 'Task ID', key: 'task_id', width: 12 },
    { header: 'Optimization Mode', key: 'optimization_mode', width: 20 },
    { header: 'Original Prompt', key: 'original_prompt', width: 45 },
    { header: 'Optimized Prompt', key: 'optimized_prompt', width: 45 },
    { header: 'Changes Summary', key: 'changes_summary', width: 35 }
  ];
  applyHeaderStyle(promptsSheet.getRow(1));

  const prompts = await Prompt.find().sort({ prompt_id: -1 }).lean();
  prompts.forEach(p => promptsSheet.addRow(p));

  // 5. Token Usage Sheet
  const tokenSheet = workbook.addWorksheet('Token Usage');
  tokenSheet.columns = [
    { header: 'Usage ID', key: 'usage_id', width: 12 },
    { header: 'Request ID', key: 'request_id', width: 14 },
    { header: 'Input Tokens', key: 'input_tokens', width: 16 },
    { header: 'Output Tokens', key: 'output_tokens', width: 16 },
    { header: 'Total Tokens', key: 'total_tokens', width: 16 },
    { header: 'Cache Read Tokens', key: 'cache_read_tokens', width: 18 }
  ];
  applyHeaderStyle(tokenSheet.getRow(1));

  usages.forEach(u => tokenSheet.addRow(u));

  // 6. Costs Sheet
  const costSheet = workbook.addWorksheet('Costs');
  costSheet.columns = [
    { header: 'Usage ID', key: 'usage_id', width: 12 },
    { header: 'Request ID', key: 'request_id', width: 14 },
    { header: 'Request Cost ($)', key: 'request_cost', width: 18 },
    { header: 'Cumulative Spent ($)', key: 'cumulative_cost', width: 20 },
    { header: 'Remaining Safety Budget ($)', key: 'remaining_budget', width: 24 }
  ];
  applyHeaderStyle(costSheet.getRow(1));

  usages.forEach(u => {
    const rw = costSheet.addRow({
      usage_id: u.usage_id,
      request_id: u.request_id,
      request_cost: Number(u.request_cost || 0),
      cumulative_cost: Number(u.cumulative_cost || 0),
      remaining_budget: Number(u.remaining_budget || 5)
    });
    rw.getCell('request_cost').numFmt = '$#,##0.000000';
    rw.getCell('cumulative_cost').numFmt = '$#,##0.000000';
    rw.getCell('remaining_budget').numFmt = '$#,##0.00';
  });

  // 7. Files Sheet
  const filesSheet = workbook.addWorksheet('Files');
  filesSheet.columns = [
    { header: 'File ID', key: 'file_id', width: 12 },
    { header: 'File Name', key: 'file_name', width: 30 },
    { header: 'File Type', key: 'file_type', width: 14 },
    { header: 'File Size (bytes)', key: 'file_size', width: 18 },
    { header: 'Uploaded UTC', key: 'created_at', width: 22 }
  ];
  applyHeaderStyle(filesSheet.getRow(1));

  const files = await File.find().sort({ file_id: -1 }).lean();
  files.forEach(f => filesSheet.addRow(f));

  // 8. AI Features Sheet
  const featSheet = workbook.addWorksheet('AI Features');
  featSheet.columns = [
    { header: 'Feature ID', key: 'feature_id', width: 12 },
    { header: 'Feature Name', key: 'feature_name', width: 30 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 45 }
  ];
  applyHeaderStyle(featSheet.getRow(1));

  const features = await AiFeature.find().sort({ category: 1, feature_name: 1 }).lean();
  features.forEach(f => featSheet.addRow(f));

  // 9. Models Sheet
  const modelsSheet = workbook.addWorksheet('Models');
  modelsSheet.columns = [
    { header: 'Model', key: 'model', width: 30 },
    { header: 'Input Price / 1M ($)', key: 'input_price_per_million', width: 20 },
    { header: 'Output Price / 1M ($)', key: 'output_price_per_million', width: 22 },
    { header: 'Cache Read / 1M ($)', key: 'cache_read_price', width: 20 },
    { header: 'Status', key: 'status', width: 14 }
  ];
  applyHeaderStyle(modelsSheet.getRow(1));

  const models = await ModelPricing.find().lean();
  models.forEach(m => {
    modelsSheet.addRow({
      model: m.model,
      input_price_per_million: Number(m.input_price_per_million),
      output_price_per_million: Number(m.output_price_per_million),
      cache_read_price: Number(m.cache_read_price || 0),
      status: m.is_active ? 'Active' : 'Inactive'
    });
  });

  // 10. Errors Sheet
  const errSheet = workbook.addWorksheet('Errors');
  errSheet.columns = [
    { header: 'Request ID', key: 'request_id', width: 14 },
    { header: 'Model', key: 'model', width: 26 },
    { header: 'Error Message', key: 'error_message', width: 55 },
    { header: 'Timestamp (UTC)', key: 'created_at', width: 22 }
  ];
  applyHeaderStyle(errSheet.getRow(1));

  const failedRequests = await ApiRequest.find({ status: 'FAILED' }).sort({ request_id: -1 }).lean();
  failedRequests.forEach(r => errSheet.addRow({
    request_id: r.request_id,
    model: r.model,
    error_message: r.error_message || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : ''
  }));

  return workbook;
}

module.exports = {
  generateResultExcel,
  generateUsageExcel,
  generateCompleteMasterExcel
};
