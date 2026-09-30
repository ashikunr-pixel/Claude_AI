const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { extractTextFromFile } = require('../services/fileProcessor.service');
const { validateFile, sanitizeFileName, MAX_FILE_SIZE_BYTES } = require('../utils/validators');
const logger = require('../utils/logger');
const mongoService = require('../services/mongo.service');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = sanitizeFileName(file.originalname);
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}_${safeName}`);
  }
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
}).single('file');

/**
 * Handle file upload and text extraction
 */
async function uploadFile(req, res, next) {
  uploadMiddleware(req, res, async (err) => {
    if (err) {
      return next(err);
    }

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file was uploaded.' });
      }

      const fileValidation = validateFile(req.file);
      if (!fileValidation.valid) {
        // Clean up unvalidated uploaded file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: fileValidation.error });
      }

      const userId = req.user.user_id;
      const removeDuplicates = req.body.removeDuplicates === 'true' || req.body.removeDuplicates === true;

      // Extract text from uploaded document
      const extraction = await extractTextFromFile(req.file.path, req.file.originalname, removeDuplicates);

      // Persist in dbo.files
      let fileId = Math.floor(Date.now() / 1000);
      try {
        const fileRes = await db.query(
          `INSERT INTO dbo.files (user_id, file_name, file_type, file_size, storage_path, extracted_text, created_at)
           VALUES (@userId, @fileName, @fileType, @fileSize, @storagePath, @extractedText, SYSUTCDATETIME());
           SELECT SCOPE_IDENTITY() AS file_id;`,
          {
            userId,
            fileName: sanitizeFileName(req.file.originalname),
            fileType: extraction.fileType,
            fileSize: req.file.size,
            storagePath: req.file.path,
            extractedText: extraction.text
          }
        );
        fileId = fileRes.recordset[0].file_id;
      } catch (sqlErr) {
        console.warn('[FileController] SQL insert bypassed, saving directly to MongoDB Atlas');
      }

      await logger.audit(userId, 'FILE_UPLOAD', 'FILE', fileId, {
        fileName: req.file.originalname,
        size: req.file.size,
        chars: extraction.cleanedLength
      }).catch(() => {});

      // Sync to MongoDB if connected
      mongoService.syncFile({
        fileId,
        userId,
        fileName: sanitizeFileName(req.file.originalname),
        fileType: extraction.fileType,
        fileSize: req.file.size,
        storagePath: req.file.path,
        extractedText: extraction.text
      });

      res.status(201).json({
        success: true,
        data: {
          fileId,
          fileName: req.file.originalname,
          fileType: extraction.fileType,
          fileSize: req.file.size,
          extractedCharacters: extraction.cleanedLength,
          preview: extraction.text.substring(0, 300) + (extraction.text.length > 300 ? '...' : '')
        }
      });
    } catch (extractErr) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      next(extractErr);
    }
  });
}

/**
 * Get uploaded files for user or admin
 */
async function getFiles(req, res, next) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = { offset, limit };
    if (!isAdmin) {
      whereClause = 'WHERE f.user_id = @userId';
      params.userId = userId;
    }

    try {
      const countRes = await db.query(`SELECT COUNT(*) AS total FROM dbo.files f ${whereClause}`, params);
      const total = countRes.recordset[0].total;

      const dataSql = `
        SELECT 
          f.file_id, f.user_id, f.task_id, f.file_name, f.file_type, f.file_size, f.created_at,
          u.name AS user_name,
          t.status AS task_status, t.task_type
        FROM dbo.files f
        JOIN dbo.users u ON f.user_id = u.user_id
        LEFT JOIN dbo.tasks t ON f.task_id = t.task_id
        ${whereClause}
        ORDER BY f.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      `;

      const dataRes = await db.query(dataSql, params);

      res.json({
        success: true,
        data: dataRes.recordset,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (sqlErr) {
      try {
        const { File } = require('../models');
        const filter = !isAdmin && userId ? { user_id: userId } : {};
        const total = await File.countDocuments(filter);
        const docs = await File.find(filter).sort({ created_at: -1 }).skip(offset).limit(limit);

        res.json({
          success: true,
          data: docs.map(d => ({
            file_id: d.file_id,
            user_id: d.user_id,
            file_name: d.file_name,
            file_type: d.file_type,
            file_size: d.file_size,
            created_at: d.created_at,
            user_name: 'User',
            task_status: 'COMPLETED'
          })),
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        });
      } catch {
        res.json({
          success: true,
          data: [],
          pagination: { total: 0, page: 1, limit, totalPages: 1 }
        });
      }
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Get file details and extracted text
 */
async function getFileById(req, res, next) {
  try {
    const fileId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let authCheck = '';
    const params = { fileId };
    if (!isAdmin) {
      authCheck = 'AND f.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `
      SELECT 
        f.file_id, f.user_id, f.task_id, f.file_name, f.file_type, f.file_size, f.extracted_text, f.created_at,
        u.name AS user_name
      FROM dbo.files f
      JOIN dbo.users u ON f.user_id = u.user_id
      WHERE f.file_id = @fileId ${authCheck}
    `;

    const result = await db.query(querySql, params);
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'File not found or unauthorized.' });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download original uploaded file
 */
async function downloadFile(req, res, next) {
  try {
    const fileId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    let authCheck = '';
    const params = { fileId };
    if (!isAdmin) {
      authCheck = 'AND f.user_id = @userId';
      params.userId = userId;
    }

    const querySql = `SELECT storage_path, file_name FROM dbo.files f WHERE f.file_id = @fileId ${authCheck}`;
    const result = await db.query(querySql, params);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'File not found or access denied.' });
    }

    const file = result.recordset[0];
    if (!fs.existsSync(file.storage_path)) {
      return res.status(404).json({ success: false, error: 'File does not exist on storage.' });
    }

    res.download(file.storage_path, file.file_name);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  getFiles,
  getFileById,
  downloadFile
};
