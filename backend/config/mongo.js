const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[MongoDB] No MONGODB_URI found in .env, skipping MongoDB connection.');
    return false;
  }

  try {
    console.log('[MongoDB] Connecting to MongoDB Atlas cluster...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    isConnected = true;
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
    isConnected = false;
    if (err.message.includes('whitelisted') || err.message.includes('Could not connect to any servers')) {
      console.warn('--------------------------------------------------------------------------------');
      console.warn('⚠️  MONGODB ATLAS IP WHITELIST REQUIRED:');
      console.warn('MongoDB Atlas is blocking the connection because your current public IP address');
      console.warn('is not added to your Atlas Network Access list.');
      console.warn('👉 To enable MongoDB Atlas:');
      console.warn('   1. Go to https://cloud.mongodb.com');
      console.warn('   2. Click "Network Access" in the left sidebar under Security');
      console.warn('   3. Click "Add IP Address"');
      console.warn('   4. Choose "Allow Access from Anywhere" (0.0.0.0/0) or add your current IP');
      console.warn('   5. Click Confirm');
      console.warn('--------------------------------------------------------------------------------');
    } else {
      console.warn('[MongoDB] Connection warning:', err.message);
    }
    return false;
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.log('[MongoDB] Disconnected from MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  console.warn('[MongoDB] Runtime error:', err.message);
});

module.exports = {
  connectMongo,
  isMongoConnected: () => isConnected,
  mongoose
};
