/**
 * Claude AI Platform - Automated Test Suite
 * Validates authentication, database, pricing, token tracking, cost calculation,
 * budget protection, file extraction, prompt optimization, and Excel export.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { connectMongo, isMongoConnected } = require('../backend/config/mongo');
const mongoose = require('mongoose');
const { estimateTokens, extractUsageTokens } = require('../backend/services/token.service');
const { calculateRequestCost, estimateRequestCost } = require('../backend/services/cost.service');
const { getBudgetStatus, checkBudgetSafety } = require('../backend/services/budget.service');
const { cleanContent, extractTextFromFile } = require('../backend/services/fileProcessor.service');
const { optimizePromptRuleBased } = require('../backend/services/promptOptimizer.service');
const { generateUsageExcel, generateCompleteMasterExcel } = require('../backend/services/export.service');
const { JWT_SECRET } = require('../backend/middleware/auth');
const { validateFile } = require('../backend/utils/validators');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('        CLAUDE AI PLATFORM - AUTOMATED VERIFICATION SUITE       ');
  console.log('================================================================\n');

  // Test 1: MongoDB Atlas Connectivity & Collections Verification
  console.log('[Test Group 1: MongoDB Atlas Database Connectivity & Collections]');
  try {
    await connectMongo();
    assert(isMongoConnected(), 'MongoDB Atlas cluster connected successfully (readyState === 1)');

    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name.toLowerCase());
    const requiredCollections = ['users', 'tasks', 'files', 'prompts', 'apirequests', 'apiusages', 'modelpricings', 'aifeatures', 'budgetsettings'];

    for (const col of requiredCollections) {
      assert(collectionNames.includes(col), `MongoDB Collection [${col}] exists in MongoDB Atlas`);
    }
  } catch (err) {
    assert(false, `MongoDB Atlas connection failed: ${err.message}`);
  }

  // Test 2: Authentication & Password Hashing
  console.log('\n[Test Group 2: Authentication & Security]');
  try {
    const password = 'TestSecretPassword123!';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const isMatch = await bcrypt.compare(password, hash);
    const isWrongMatch = await bcrypt.compare('WrongPassword', hash);

    assert(isMatch === true, 'Bcrypt password hashing and positive match succeeds');
    assert(isWrongMatch === false, 'Bcrypt negative match properly rejected');

    const token = jwt.sign({ user_id: 1, email: 'admin@claude.ai', role: 'ADMIN' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);
    assert(decoded.user_id === 1 && decoded.role === 'ADMIN', 'JWT token signing and verification succeeds');
  } catch (err) {
    assert(false, `Auth tests failed: ${err.message}`);
  }

  // Test 3: Token Estimation & Usage Extraction
  console.log('\n[Test Group 3: Token Service & Provider Usage Parsing]');
  const samplePrompt = 'Summarize the financial statements for Q3 and highlight net revenue.';
  const estTokens = estimateTokens(samplePrompt);
  assert(estTokens > 5 && estTokens < 30, `Estimated tokens heuristic: ${estTokens} tokens`);

  const mockProviderUsage = {
    input_tokens: 1540,
    output_tokens: 420,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 120
  };
  const extracted = extractUsageTokens(mockProviderUsage);
  assert(extracted.inputTokens === 1540, 'Input tokens properly parsed from provider');
  assert(extracted.outputTokens === 420, 'Output tokens properly parsed from provider');
  assert(extracted.cacheReadTokens === 120, 'Cache read tokens captured separately');
  assert(extracted.totalTokens === 2080, 'Total tokens handles input + output + cache accurately');

  // Test 4: Cost Calculation (Dynamic Model Pricing)
  console.log('\n[Test Group 4: Dynamic Cost Calculation]');
  const costRes = await calculateRequestCost('claude-3-7-sonnet-20250219', 1000000, 1000000);
  assert(costRes.inputCost === 3.00, 'Sonnet input cost: $3.00 per 1M tokens');
  assert(costRes.outputCost === 15.00, 'Sonnet output cost: $15.00 per 1M tokens');
  assert(costRes.totalCost === 18.00, 'Sonnet total request cost: $18.00');

  const smallCost = await calculateRequestCost('claude-3-5-haiku-20241022', 1000, 500);
  assert(smallCost.totalCost > 0, `Haiku small request cost: $${smallCost.totalCost.toFixed(6)}`);

  // Test 5: $5 Application Safety Budget Protection
  console.log('\n[Test Group 5: $5 Application Safety Budget Protection]');
  const budgetStatus = await getBudgetStatus();
  assert(budgetStatus.budgetUsd === 5.00, 'Configured application safety budget is $5.00 USD');
  assert(budgetStatus.remainingBudget <= 5.00, `Remaining budget is: $${budgetStatus.remainingBudget.toFixed(4)}`);

  // Safety checks
  const safeReq = await checkBudgetSafety(0.005, true);
  assert(safeReq.allowed === true && safeReq.warning === false, 'Normal request ($0.005) marked SAFE TO PROCESS');

  const massiveReq = await checkBudgetSafety(10.00, true);
  assert(massiveReq.hardBlocked === true && massiveReq.allowed === false, 'Hard Budget Stop blocks request exceeding remaining safety budget');

  // Test 6: Content Cleaning & Deduplication
  console.log('\n[Test Group 6: File Processing & Content Cleaning]');
  const messyText = '  Line 1   \r\n\r\n\r\n\r\nLine 2 with spaces   \r\nLine 2 with spaces   \r\n';
  const cleanedDeduped = cleanContent(messyText, true);
  assert(!cleanedDeduped.includes('\r'), 'Line endings normalized from CRLF to standard LF');
  assert(!cleanedDeduped.includes('\n\n\n'), 'Redundant blank lines collapsed');

  // Test 7: Prompt Optimization Modes
  console.log('\n[Test Group 7: Prompt Optimization Modes]');
  const rawInput = 'please summarize this text document kindly';
  const optStandard = optimizePromptRuleBased(rawInput, 'Standard');
  assert(optStandard.optimizedPrompt === rawInput, 'Standard mode leaves user prompt verbatim');

  const optOptimized = optimizePromptRuleBased(rawInput, 'Optimized');
  assert(optOptimized.optimizedPrompt.includes('[Role]') && optOptimized.optimizedPrompt.includes('[Output Format]'), 'Optimized mode provides structural role framing and format instructions');

  const optMaxEff = optimizePromptRuleBased(rawInput, 'Maximum Efficiency');
  assert(!optMaxEff.optimizedPrompt.toLowerCase().startsWith('please'), 'Maximum Efficiency mode removes conversational fluff words');

  // Test 8: File Format Validation
  console.log('\n[Test Group 8: File Validation]');
  const validFile = { originalname: 'data.pdf', size: 1024 * 1024 };
  const invalidExt = { originalname: 'malware.exe', size: 1024 };
  const oversized = { originalname: 'huge.txt', size: 50 * 1024 * 1024 };

  assert(validateFile(validFile).valid === true, 'PDF file accepted');
  assert(validateFile(invalidExt).valid === false, 'Executable file (.exe) rejected');
  assert(validateFile(oversized).valid === false, 'Oversized file (>15MB) rejected');

  // Test 9: Multi-Sheet Excel Export Generation
  console.log('\n[Test Group 9: Multi-Sheet Excel (.xlsx) Generation]');
  try {
    const workbook = await generateCompleteMasterExcel(null, 'ADMIN');
    assert(workbook.worksheets.length === 10, 'Complete master workbook contains all 10 required sheets');

    const sheetNames = workbook.worksheets.map(w => w.name);
    const expectedSheets = ['Summary', 'Tasks', 'API Requests', 'Prompts', 'Token Usage', 'Costs', 'Files', 'AI Features', 'Models', 'Errors'];
    for (const s of expectedSheets) {
      assert(sheetNames.includes(s), `Sheet [${s}] generated successfully`);
    }

    const testExportPath = path.join(__dirname, '../exports/test_verification_report.xlsx');
    await workbook.xlsx.writeFile(testExportPath);
    assert(fs.existsSync(testExportPath), 'Generated Excel workbook written to disk successfully');
    fs.unlinkSync(testExportPath); // Clean up test file
  } catch (err) {
    assert(false, `Excel generation failed: ${err.message}`);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
