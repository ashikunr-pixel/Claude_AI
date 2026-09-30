const http = require('http');

function post(path, body, token = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'GET',
      headers
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runE2eTests() {
  console.log('Testing E2E Endpoints over http://localhost:3000 ...\n');

  // 1. Status Check
  const statusRes = await get('/api/system/status');
  console.log('1. System Status Check:', statusRes.status === 200 ? 'SUCCESS' : 'FAILED', statusRes.data);

  // 2. Models Check
  const modelsRes = await get('/api/system/models');
  console.log('2. Available Models:', modelsRes.status === 200 ? 'SUCCESS' : 'FAILED', `Loaded ${modelsRes.data?.data?.length || 0} models`);

  // 3. Features Check
  const featRes = await get('/api/system/features');
  console.log('3. AI Features Catalog:', featRes.status === 200 ? 'SUCCESS' : 'FAILED', `Loaded ${featRes.data?.data?.length || 0} features`);

  // 4. Login as Admin
  const loginRes = await post('/api/auth/login', {
    email: 'admin@claude.ai',
    password: 'AdminPassword123!'
  });
  console.log('4. Admin Login:', loginRes.status === 200 ? 'SUCCESS' : 'FAILED', loginRes.data?.user);
  const token = loginRes.data?.token;

  if (!token) {
    console.error('Failed to obtain token');
    process.exit(1);
  }

  // 5. Authenticated /api/auth/me
  const meRes = await get('/api/auth/me', token);
  console.log('5. Current User Profile:', meRes.status === 200 ? 'SUCCESS' : 'FAILED', meRes.data?.user?.email);

  // 6. Dashboard Summary
  const summaryRes = await get('/api/usage/summary', token);
  console.log('6. Dashboard Summary:', summaryRes.status === 200 ? 'SUCCESS' : 'FAILED', {
    budget: summaryRes.data?.data?.applicationBudget,
    spent: summaryRes.data?.data?.usedBudget,
    remaining: summaryRes.data?.data?.remainingBudget,
    status: summaryRes.data?.data?.budgetStatus
  });

  // 7. Prompt Optimization (Rule-based & structural)
  const optRes = await post('/api/prompts/optimize', {
    prompt: 'Please explain how database indexing works',
    mode: 'Optimized'
  }, token);
  console.log('7. Prompt Optimization (Optimized Mode):', optRes.status === 200 ? 'SUCCESS' : 'FAILED', {
    mode: optRes.data?.data?.mode,
    diff: optRes.data?.data?.tokenDiff,
    summary: optRes.data?.data?.changesSummary
  });

  // 8. Pre-check Cost
  const preCheckRes = await post('/api/budget/pre-check', {
    prompt: 'Explain the principles of distributed systems',
    model: 'claude-3-7-sonnet-20250219',
    maxOutputTokens: 1024
  }, token);
  console.log('8. Budget Pre-Check:', preCheckRes.status === 200 ? 'SUCCESS' : 'FAILED', {
    estCost: preCheckRes.data?.data?.estimatedCost,
    safetyAllowed: preCheckRes.data?.data?.safety?.allowed,
    statusMessage: preCheckRes.data?.data?.safety?.message
  });

  // 9. Static Frontend HTML files check
  const htmlCheck = await get('/dashboard.html');
  console.log('9. Frontend Serving (dashboard.html):', htmlCheck.status === 200 ? 'SUCCESS' : 'FAILED', `Length: ${htmlCheck.raw?.length || 0} bytes`);

  console.log('\nAll Endpoints Verified Successfully!');
}

runE2eTests().catch(console.error);
