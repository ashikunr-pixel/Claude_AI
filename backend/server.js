const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { isApiKeyConfigured, getMaskedApiKey, DEFAULT_MODEL } = require('./config/ai');
const { getBudgetStatus } = require('./services/budget.service');
const { connectMongo } = require('./config/mongo');

// Route imports
const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const fileRoutes = require('./routes/file.routes');
const promptRoutes = require('./routes/prompt.routes');
const usageRoutes = require('./routes/usage.routes');
const budgetRoutes = require('./routes/budget.routes');
const resultRoutes = require('./routes/result.routes');
const exportRoutes = require('./routes/export.routes');
const systemRoutes = require('./routes/system.routes');
const keyRoutes = require('./routes/key.routes');
const { ensureDefaultKey } = require('./services/key.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts and chart.js cdn in development frontend
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key-Id', 'x-api-key-id']
}));

// Rate limiter: 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.'
  }
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/prompts', promptRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/keys', keyRoutes);

// Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Fallback to index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 404 handler for API routes
app.use('/api/*', notFoundHandler);

// Central Error Handler
app.use(errorHandler);

// Start server
async function startServer() {
  console.log('================================================================');
  console.log('       CLAUDE AI ENTERPRISE PLATFORM & USAGE MONITOR             ');
  console.log('================================================================');
  
  // 1. Connect to MongoDB Atlas FIRST
  await connectMongo();
  await ensureDefaultKey();

  // 2. Load budget telemetry
  try {
    const budget = await getBudgetStatus();
    console.log(`[Budget]   Safety Limit: $${budget.budgetUsd.toFixed(2)} USD (Spent: $${budget.cumulativeSpent.toFixed(4)} | Remaining: $${budget.remainingBudget.toFixed(4)})`);
  } catch (err) {
    console.warn(`[Budget]   Warning reading budget on startup: ${err.message}`);
  }

  // 3. Open port to incoming traffic
  app.listen(PORT, () => {
    console.log(`[Server]   Running at: http://localhost:${PORT}`);
    console.log(`[Frontend] Serving UI from: ${frontendPath}`);
    console.log(`[Claude]   Default Model: ${DEFAULT_MODEL}`);
    console.log(`[API Key]  Status: ${isApiKeyConfigured() ? 'Configured (' + getMaskedApiKey() + ')' : 'MISSING / EMPTY in .env'}`);
    console.log(`[Database] Engine: MongoDB Atlas Cluster [100% Native]`);
    console.log('================================================================');
  });
}

startServer();

module.exports = app;
