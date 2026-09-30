const seedMongo = require('./seed-mongo');

async function initDb() {
  console.log('[InitDB] Initializing MongoDB Atlas collections and seeds...');
  return await seedMongo();
}

if (require.main === module) {
  initDb().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { initDb };
