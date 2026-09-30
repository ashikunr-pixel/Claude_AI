const { connectMongo, isMongoConnected } = require('./mongo');

/**
 * Pure MongoDB Atlas Database Adapter
 * SQL Server has been completely replaced by MongoDB Atlas.
 */
async function getPool() {
  await connectMongo();
  return {
    request: () => ({
      input: () => {},
      query: async () => ({ recordset: [], rowsAffected: [0] })
    })
  };
}

async function query() {
  return { recordset: [], rowsAffected: [0] };
}

async function executeTransaction(cb) {
  return await cb({});
}

module.exports = {
  getPool,
  query,
  executeTransaction,
  connectMongo,
  isMongoConnected
};
