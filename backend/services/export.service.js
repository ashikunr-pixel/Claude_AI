const ExcelJS = require('exceljs');
const db = require('../config/database');
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
  const params = { taskId };
  let authFilter = '';
  if (!isAdmin && userId) {
    authFilter = 'AND t.user_id = @userId';
    params.userId = userId;
  }

  const querySql = `
    SELECT 
      t.task_id, t.task_type, t.status, t.created_at, t.completed_at,
      p.original_prompt, p.optimized_prompt, p.optimization_mode,
      r.model, r.processing_time_ms,
      us.input_tokens, us.output_tokens, us.total_tokens, us.request_cost,
      gr.result_content, gr.result_format
    FROM dbo.tasks t
    LEFT JOIN dbo.prompts p ON t.task_id = p.task_id
    LEFT JOIN dbo.api_requests r ON t.task_id = r.task_id
    LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
    LEFT JOIN dbo.generated_results gr ON t.task_id = gr.task_id
    WHERE t.task_id = @taskId ${authFilter}
  `;

  const res = await db.query(querySql, params);
  if (res.recordset.length === 0) {
    throw new Error('Task result not found or access denied.');
  }

  const row = res.recordset[0];
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

  resultSheet.addRow({ attr: 'Task ID', val: row.task_id });
  resultSheet.addRow({ attr: 'Task Type', val: row.task_type });
  resultSheet.addRow({ attr: 'Model', val: row.model || 'N/A' });
  resultSheet.addRow({ attr: 'Status', val: row.status });
  resultSheet.addRow({ attr: 'Input Tokens', val: row.input_tokens || 0 });
  resultSheet.addRow({ attr: 'Output Tokens', val: row.output_tokens || 0 });
  resultSheet.addRow({ attr: 'Total Tokens', val: row.total_tokens || 0 });
  resultSheet.addRow({ attr: 'Request Cost ($)', val: row.request_cost || 0 });
  resultSheet.addRow({ attr: 'Original Prompt', val: row.original_prompt || '' });
  resultSheet.addRow({ attr: 'Result Content', val: row.result_content || '' });

  resultSheet.getColumn(2).alignment = { wrapText: true };

  return workbook;
}

/**
 * Generate Excel usage report
 */
async function generateUsageExcel(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const params = {};
  let userFilter = '';
  if (!isAdmin && userId) {
    userFilter = 'WHERE r.user_id = @userId';
    params.userId = userId;
  }

  const querySql = `
    SELECT 
      r.request_id, r.created_at, u.name AS user_name,
      r.model, r.provider, r.status, r.processing_time_ms,
      t.task_type,
      us.input_tokens, us.output_tokens, us.total_tokens,
      us.request_cost, us.cumulative_cost, us.remaining_budget
    FROM dbo.api_requests r
    JOIN dbo.users u ON r.user_id = u.user_id
    LEFT JOIN dbo.tasks t ON r.task_id = t.task_id
    LEFT JOIN dbo.api_usage us ON r.request_id = us.request_id
    ${userFilter}
    ORDER BY r.created_at DESC
  `;

  const res = await db.query(querySql, params);
  const rows = res.recordset;

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

  rows.forEach((r) => {
    const row = sheet.addRow({
      request_id: r.request_id,
      created_at: new Date(r.created_at).toISOString().replace('T', ' ').substring(0, 19),
      user_name: r.user_name,
      task_type: r.task_type || 'Custom',
      model: r.model,
      input_tokens: r.input_tokens || 0,
      output_tokens: r.output_tokens || 0,
      total_tokens: r.total_tokens || 0,
      request_cost: r.request_cost ? Number(r.request_cost) : 0,
      cumulative_cost: r.cumulative_cost ? Number(r.cumulative_cost) : 0,
      remaining_budget: r.remaining_budget ? Number(r.remaining_budget) : 5,
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
 * Sheets:
 * 1. Summary
 * 2. Tasks
 * 3. API Requests
 * 4. Prompts
 * 5. Token Usage
 * 6. Costs
 * 7. Files
 * 8. AI Features
 * 9. Models
 * 10. Errors
 */
async function generateCompleteMasterExcel(userId = null, role = 'USER') {
  const isAdmin = role === 'ADMIN';
  const params = {};
  let userFilter = '';
  if (!isAdmin && userId) {
    userFilter = 'WHERE t.user_id = @userId';
    params.userId = userId;
  }

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

  const totalReqRes = await db.query(
    `SELECT COUNT(*) AS total_req, ISNULL(SUM(input_tokens), 0) AS total_in, ISNULL(SUM(output_tokens), 0) AS total_out, ISNULL(SUM(total_tokens), 0) AS total_all, ISNULL(SUM(request_cost), 0.0) AS total_cost
     FROM dbo.api_usage u
     JOIN dbo.api_requests r ON u.request_id = r.request_id
     ${!isAdmin && userId ? 'WHERE r.user_id = @userId' : ''}`,
    params
  );
  const sumData = totalReqRes.recordset[0];

  summarySheet.addRow({ metric: 'Configured Application Safety Budget', val: `$${budget.budgetUsd.toFixed(2)} USD` });
  summarySheet.addRow({ metric: 'Cumulative Tracked Spending', val: `$${budget.cumulativeSpent.toFixed(6)} USD` });
  summarySheet.addRow({ metric: 'Remaining Application Budget', val: `$${budget.remainingBudget.toFixed(6)} USD` });
  summarySheet.addRow({ metric: 'Budget Utilization (%)', val: `${budget.usagePercentage.toFixed(2)}%` });
  summarySheet.addRow({ metric: 'Total API Requests Completed', val: sumData.total_req });
  summarySheet.addRow({ metric: 'Total Input Tokens Consumed', val: sumData.total_in });
  summarySheet.addRow({ metric: 'Total Output Tokens Generated', val: sumData.total_out });
  summarySheet.addRow({ metric: 'Total Tokens Tracked', val: sumData.total_all });
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

  const tasksRes = await db.query(
    `SELECT task_id, task_type, status, created_at, completed_at FROM dbo.tasks t ${userFilter} ORDER BY task_id DESC`,
    params
  );
  tasksRes.recordset.forEach(r => tasksSheet.addRow(r));

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

  const reqRes = await db.query(
    `SELECT request_id, task_id, model, provider, status, processing_time_ms, created_at 
     FROM dbo.api_requests r 
     ${!isAdmin && userId ? 'WHERE r.user_id = @userId' : ''} 
     ORDER BY request_id DESC`,
    params
  );
  reqRes.recordset.forEach(r => reqSheet.addRow(r));

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

  const promptsRes = await db.query(
    `SELECT p.prompt_id, p.task_id, p.optimization_mode, p.original_prompt, p.optimized_prompt, p.changes_summary
     FROM dbo.prompts p
     JOIN dbo.tasks t ON p.task_id = t.task_id
     ${userFilter}
     ORDER BY p.prompt_id DESC`,
    params
  );
  promptsRes.recordset.forEach(r => promptsSheet.addRow(r));

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

  const tokenRes = await db.query(
    `SELECT u.usage_id, u.request_id, u.input_tokens, u.output_tokens, u.total_tokens, u.cache_read_tokens
     FROM dbo.api_usage u
     JOIN dbo.api_requests r ON u.request_id = r.request_id
     ${!isAdmin && userId ? 'WHERE r.user_id = @userId' : ''}
     ORDER BY u.usage_id DESC`,
    params
  );
  tokenRes.recordset.forEach(r => tokenSheet.addRow(r));

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

  const costRes = await db.query(
    `SELECT u.usage_id, u.request_id, u.request_cost, u.cumulative_cost, u.remaining_budget
     FROM dbo.api_usage u
     JOIN dbo.api_requests r ON u.request_id = r.request_id
     ${!isAdmin && userId ? 'WHERE r.user_id = @userId' : ''}
     ORDER BY u.usage_id DESC`,
    params
  );
  costRes.recordset.forEach(r => {
    const rw = costSheet.addRow({
      usage_id: r.usage_id,
      request_id: r.request_id,
      request_cost: Number(r.request_cost),
      cumulative_cost: Number(r.cumulative_cost),
      remaining_budget: Number(r.remaining_budget)
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

  const filesRes = await db.query(
    `SELECT file_id, file_name, file_type, file_size, created_at 
     FROM dbo.files f 
     ${!isAdmin && userId ? 'WHERE f.user_id = @userId' : ''} 
     ORDER BY file_id DESC`,
    params
  );
  filesRes.recordset.forEach(r => filesSheet.addRow(r));

  // 8. AI Features Sheet
  const featSheet = workbook.addWorksheet('AI Features');
  featSheet.columns = [
    { header: 'Feature ID', key: 'feature_id', width: 12 },
    { header: 'Feature Name', key: 'feature_name', width: 30 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 45 }
  ];
  applyHeaderStyle(featSheet.getRow(1));

  const featRes = await db.query('SELECT feature_id, feature_name, category, description FROM dbo.ai_features ORDER BY category, feature_name');
  featRes.recordset.forEach(r => featSheet.addRow(r));

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

  const modelsRes = await db.query('SELECT model, input_price_per_million, output_price_per_million, cache_read_price, is_active FROM dbo.model_pricing');
  modelsRes.recordset.forEach(r => {
    modelsSheet.addRow({
      model: r.model,
      input_price_per_million: Number(r.input_price_per_million),
      output_price_per_million: Number(r.output_price_per_million),
      cache_read_price: Number(r.cache_read_price || 0),
      status: r.is_active ? 'Active' : 'Inactive'
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

  const errRes = await db.query(
    `SELECT request_id, model, error_message, created_at 
     FROM dbo.api_requests 
     WHERE status = 'FAILED' ${!isAdmin && userId ? 'AND user_id = @userId' : ''} 
     ORDER BY request_id DESC`,
    params
  );
  errRes.recordset.forEach(r => errSheet.addRow(r));

  return workbook;
}

module.exports = {
  generateResultExcel,
  generateUsageExcel,
  generateCompleteMasterExcel
};
