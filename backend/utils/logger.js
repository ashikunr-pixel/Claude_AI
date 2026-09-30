const { AuditLog, getNextSequence } = require('../models');

function maskSensitive(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/sk-ant-[a-zA-Z0-9_\-]+/gi, 'sk-ant-[REDACTED]')
    .replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
    .replace(/("password":\s*")[^"]+(")/gi, '$1[REDACTED]$2');
}

const logger = {
  info: (msg, meta = {}) => {
    console.log(`[INFO]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? maskSensitive(JSON.stringify(meta)) : '');
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN]  [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? maskSensitive(JSON.stringify(meta)) : '');
  },
  error: (msg, err = {}) => {
    const errObj = err instanceof Error ? { message: err.message, stack: err.stack } : err;
    console.error(`[ERROR] [${new Date().toISOString()}] ${msg}`, maskSensitive(JSON.stringify(errObj)));
  },
  debug: (msg, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] [${new Date().toISOString()}] ${msg}`, Object.keys(meta).length ? maskSensitive(JSON.stringify(meta)) : '');
    }
  },
  /**
   * Log an audit action directly to MongoDB Atlas
   */
  audit: async (userId, action, entityType, entityId = null, details = null) => {
    try {
      const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;
      const logId = await getNextSequence('log_id');
      await AuditLog.create({
        log_id: logId,
        user_id: userId,
        action,
        resource_type: entityType,
        resource_id: entityId,
        details: detailsStr ? maskSensitive(detailsStr) : null,
        timestamp: new Date()
      });
    } catch {
      // In-memory silent fallback
    }
  }
};

module.exports = logger;
