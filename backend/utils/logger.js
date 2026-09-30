const db = require('../config/database');

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
   * Log an audit action to SQL Server audit_logs table
   */
  audit: async (userId, action, entityType, entityId = null, details = null) => {
    try {
      const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;
      await db.query(
        `INSERT INTO dbo.audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES (@userId, @action, @entityType, @entityId, @details)`,
        {
          userId,
          action,
          entityType,
          entityId,
          details: detailsStr ? maskSensitive(detailsStr) : null
        }
      );

      // Sync to MongoDB if connected
      const mongoService = require('../services/mongo.service');
      mongoService.syncAuditLog({
        userId,
        action,
        resourceType: entityType,
        resourceId: entityId,
        details: detailsStr ? maskSensitive(detailsStr) : null
      });
    } catch (err) {
      console.error('[AuditLog] Failed to persist audit record:', err.message);
    }
  }
};

module.exports = logger;
