const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Clean extracted text content
 * Normalizes line endings, strips non-printable control characters, compresses redundant whitespace.
 */
function cleanContent(text, removeDuplicates = false) {
  if (!text || typeof text !== 'string') return '';

  // Remove null characters and non-printable control chars (except newline and tab)
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize Windows/Mac line endings to standard LF
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse 3 or more newlines into double newline
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim spaces on each line
  cleaned = cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();

  // Deduplicate identical paragraphs if requested
  if (removeDuplicates) {
    const paragraphs = cleaned.split(/\n\s*\n/);
    const seen = new Set();
    const deduped = [];

    for (const p of paragraphs) {
      const normalizedP = p.trim().toLowerCase();
      if (normalizedP.length > 20) {
        if (!seen.has(normalizedP)) {
          seen.add(normalizedP);
          deduped.push(p);
        }
      } else {
        deduped.push(p);
      }
    }
    cleaned = deduped.join('\n\n');
  }

  return cleaned;
}

/**
 * Extract plain text from supported uploaded file
 * @param {string} filePath - Absolute path to stored file
 * @param {string} originalName - Original uploaded filename
 * @param {boolean} removeDuplicates - Whether to remove duplicate paragraphs
 */
async function extractTextFromFile(filePath, originalName, removeDuplicates = false) {
  const ext = path.extname(originalName).toLowerCase();
  let rawText = '';

  switch (ext) {
    case '.txt':
    case '.md':
      rawText = fs.readFileSync(filePath, 'utf-8');
      break;

    case '.json': {
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        rawText = JSON.stringify(parsed, null, 2);
      } catch {
        rawText = content;
      }
      break;
    }

    case '.csv': {
      rawText = fs.readFileSync(filePath, 'utf-8');
      break;
    }

    case '.pdf': {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      rawText = pdfData.text || '';
      break;
    }

    case '.docx': {
      const docxResult = await mammoth.extractRawText({ path: filePath });
      rawText = docxResult.value || '';
      break;
    }

    default:
      throw new Error(`Unsupported file format for text extraction: "${ext}"`);
  }

  const cleanedText = cleanContent(rawText, removeDuplicates);

  return {
    rawLength: rawText.length,
    cleanedLength: cleanedText.length,
    text: cleanedText,
    fileType: ext
  };
}

module.exports = {
  extractTextFromFile,
  cleanContent
};
