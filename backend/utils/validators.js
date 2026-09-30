const path = require('path');

const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.docx', '.csv', '.json', '.md'];
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/json',
  'text/markdown'
];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim().toLowerCase());
}

function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6; // At least 6 characters
}

function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') return 'unnamed_file';
  // Remove directory traversal characters and special characters
  const basename = path.basename(fileName);
  return basename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type "${ext}". Supported types: ${ALLOWED_EXTENSIONS.join(', ')}`
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB limit.`
    };
  }

  return { valid: true };
}

function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim();
}

module.exports = {
  isValidEmail,
  isValidPassword,
  sanitizeFileName,
  validateFile,
  sanitizeText,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES
};
