const sql = require('mssql');
require('dotenv').config();

const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
const database = process.env.DB_DATABASE || 'ClaudeAI_DB';
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const port = parseInt(process.env.DB_PORT || '1433', 10);

const parts = server.split('\\');
const serverHost = parts[0] || 'localhost';
const instanceName = parts[1] || undefined;

const config = {
  user,
  password,
  server: serverHost,
  database,
  port: instanceName ? undefined : port,
  options: {
    enableArithAbort: true,
    trustServerCertificate: true,
    instanceName
  },
  connectionTimeout: 4000,
  requestTimeout: 15000,
  pool: {
    max: 15,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

async function getPool() {
  if (!pool) {
    try {
      pool = await new sql.ConnectionPool(config).connect();
      console.log(`[Database] Connected to SQL Server [${server}] - Database [${database}]`);
    } catch (err) {
      console.error('[Database] Connection error:', err.message);
      throw err;
    }
  }
  return pool;
}

/**
 * Execute parameterized SQL query
 * @param {string} queryText - SQL query text with @param placeholders
 * @param {Object} [params] - Object with parameter names as keys and { type, value } or raw values
 */
async function query(queryText, params = {}) {
  const p = await getPool();
  const request = p.request();

  for (const [key, val] of Object.entries(params)) {
    if (val && typeof val === 'object' && 'type' in val && 'value' in val) {
      request.input(key, val.type, val.value);
    } else {
      request.input(key, val);
    }
  }

  return await request.query(queryText);
}

/**
 * Execute a transaction block
 * @param {Function} callback - async function(transaction, request)
 */
async function executeTransaction(callback) {
  const p = await getPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  sql,
  getPool,
  query,
  executeTransaction
};
