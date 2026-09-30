const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error during ${req.method} ${req.originalUrl}:`, err);

  // Anthropic API error handling
  if (err.status || err.name === 'APIError' || err.name === 'NotFoundError' || err.name === 'BadRequestError') {
    const status = err.status || 500;
    const msg = (err.error && err.error.message) ? err.error.message : err.message;

    if (status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Anthropic API key is invalid or unauthorized. Please verify ANTHROPIC_API_KEY in .env.'
      });
    }

    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Claude API rate limit reached. Please wait a moment before trying again.'
      });
    }

    if (status >= 500) {
      return res.status(502).json({
        success: false,
        error: `Claude AI provider service is temporarily unavailable: ${msg}`
      });
    }

    return res.status(status).json({
      success: false,
      error: `Claude API Error: ${msg}`
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'Uploaded file exceeds the maximum permitted size limit.'
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `A record with this ${field} already exists.`
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(', ')
    });
  }

  const statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : 500);
  const clientMessage = err.message || 'An error occurred during request execution.';

  res.status(statusCode).json({
    success: false,
    error: clientMessage
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
