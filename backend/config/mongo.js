const mongoose = require('mongoose');
require('dotenv').config();

let connectionPromise = null;

async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[MongoDB] No MONGODB_URI found in .env, skipping MongoDB connection.');
    return false;
  }

  connectionPromise = (async () => {
    try {
      console.log('[MongoDB] Connecting to MongoDB Atlas cluster...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 25,
        minPoolSize: 2,
        retryWrites: true
      });
      console.log('[MongoDB] Successfully connected to MongoDB Atlas!');

      // Auto-seed if needed
      try {
        const { BudgetSetting } = require('../models');
        const count = await BudgetSetting.countDocuments();
        if (count === 0) {
          console.log('[MongoDB] Initializing seed data in MongoDB...');
          const seedMongo = require('./seed-mongo');
          await seedMongo();
        }
      } catch (seedErr) {
        console.warn('[MongoDB] Seed check warning:', seedErr.message);
      }

      return true;
    } catch (err) {
      if (err.message.includes('whitelisted') || err.message.includes('Could not connect to any servers') || err.message.includes('timed out')) {
        console.warn('--------------------------------------------------------------------------------');
        console.warn('⚠️  MONGODB ATLAS CONNECTION NOTICE:');
        console.warn('Error:', err.message);
        console.warn('👉 If your network blocks Atlas, verify:');
        console.warn('   1. In https://cloud.mongodb.com -> Network Access, add 0.0.0.0/0');
        console.warn('   2. Verify username and password in MONGODB_URI');
        console.warn('--------------------------------------------------------------------------------');
      } else {
        console.warn('[MongoDB] Connection warning:', err.message);
      }
      return false;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

mongoose.connection.on('disconnected', () => {
  console.log('[MongoDB] Disconnected from MongoDB Atlas, attempting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Reconnected to MongoDB Atlas!');
});

mongoose.connection.on('error', (err) => {
  console.warn('[MongoDB] Runtime error:', err.message);
});

module.exports = {
  connectMongo,
  isMongoConnected: () => mongoose.connection.readyState === 1,
  mongoose
};
