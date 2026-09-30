const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { File, getNextSequence } = require('../models');
const { extractTextFromFile } = require('../services/fileProcessor.service');
const { validateFile, sanitizeFileName, MAX_FILE_SIZE_BYTES } = require('../utils/validators');
const logger = require('../utils/logger');

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
 * Handle file upload and text extraction (MongoDB Atlas)
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
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: fileValidation.error });
      }

      const userId = req.user.user_id;
      const removeDuplicates = req.body.removeDuplicates === 'true' || req.body.removeDuplicates === true;

      // Extract text from uploaded document
      const extraction = await extractTextFromFile(req.file.path, req.file.originalname, removeDuplicates);

      let finalFileId;
      let fileDoc;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          finalFileId = await getNextSequence('file_id');
          fileDoc = await File.create({
            file_id: finalFileId,
            user_id: userId,
            file_name: sanitizeFileName(req.file.originalname),
            file_type: extraction.fileType,
            file_size: req.file.size,
            storage_path: req.file.path,
            extracted_text: extraction.text,
            created_at: new Date()
          });
          break;
        } catch (insertErr) {
          if (insertErr.code === 11000 && attempt < 2) {
            continue;
          }
          throw insertErr;
        }
      }

      logger.audit(userId, 'FILE_UPLOAD', 'FILE', finalFileId, {
        fileName: req.file.originalname,
        size: req.file.size,
        chars: extraction.cleanedLength
      }).catch(() => {});

      const filePayload = {
        fileId: finalFileId,
        fileName: sanitizeFileName(req.file.originalname),
        fileType: extraction.fileType,
        fileSize: req.file.size,
        charCount: extraction.cleanedLength,
        extractedCharacters: extraction.cleanedLength,
        estimatedTokens: extraction.estimatedTokens,
        preview: extraction.previewText || extraction.text || '',
        previewText: extraction.previewText || '',
        extractedText: extraction.text || ''
      };

      res.status(201).json({
        success: true,
        message: 'File uploaded and parsed successfully.',
        file: filePayload,
        data: filePayload
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
 * Get paginated list of uploaded files (MongoDB Atlas)
 */
async function getFiles(req, res, next) {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const filter = !isAdmin && userId ? { user_id: userId } : {};
    const total = await File.countDocuments(filter);
    const docs = await File.find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: docs.map(d => ({
        file_id: d.file_id,
        user_id: d.user_id,
        task_id: d.task_id,
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
  } catch (err) {
    next(err);
  }
}

/**
 * Get file details and extracted text (MongoDB Atlas)
 */
async function getFileById(req, res, next) {
  try {
    const fileId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const query = { file_id: fileId };
    if (!isAdmin) {
      query.user_id = userId;
    }

    const doc = await File.findOne(query).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'File not found or unauthorized.' });
    }

    res.json({
      success: true,
      data: {
        file_id: doc.file_id,
        user_id: doc.user_id,
        task_id: doc.task_id,
        file_name: doc.file_name,
        file_type: doc.file_type,
        file_size: doc.file_size,
        extracted_text: doc.extracted_text,
        created_at: doc.created_at,
        user_name: 'User'
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download original uploaded file (MongoDB Atlas)
 */
async function downloadFile(req, res, next) {
  try {
    const fileId = parseInt(req.params.id, 10);
    const isAdmin = req.user.role === 'ADMIN';
    const userId = req.user.user_id;

    const query = { file_id: fileId };
    if (!isAdmin) {
      query.user_id = userId;
    }

    const doc = await File.findOne(query).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'File not found or access denied.' });
    }

    if (!doc.storage_path || !fs.existsSync(doc.storage_path)) {
      return res.status(404).json({ success: false, error: 'File does not exist on storage.' });
    }

    res.download(doc.storage_path, doc.file_name);
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
