const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { ApiKey, ApiUsage, ApiRequest, getNextSequence } = require('../models');
const logger = require('../utils/logger');
require('dotenv').config();

// Derive 32-byte encryption key from JWT_SECRET or fallback
const SECRET_SEED = process.env.JWT_SECRET || 'claude-ai-platform-encryption-key-secret-2026';
const ENCRYPTION_KEY = crypto.scryptSync(SECRET_SEED, 'claude_api_keys_salt_2026', 32);

/**
 * Encrypt raw Anthropic API key using AES-256-GCM
 */
function encryptKey(plainKey) {
  if (!plainKey || typeof plainKey !== 'string') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt API key string
 */
function decryptKey(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return '';
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    logger.warn('Failed to decrypt API key:', err.message);
    return '';
  }
}

/**
 * Mask API key for UI display (e.g. ••••••••8F21)
 * The frontend NEVER receives the complete API key.
 */
function maskKey(plainKey) {
  if (!plainKey || typeof plainKey !== 'string') return '••••••••';
  const clean = plainKey.trim();
  if (clean.length <= 8) return '••••••••';
  const last4 = clean.slice(-4).toUpperCase();
  return `••••••••${last4}`;
}

/**
 * List all API keys (masked, with usage stats)
 */
async function listApiKeys(includeStats = true) {
  await ensureDefaultKey();

  const keys = await ApiKey.find().sort({ is_default: -1, created_at: -1 }).lean();

  const results = [];
  for (const k of keys) {
    let totalRequests = 0;
    let totalCost = 0.0;
    let totalTokens = 0;

    if (includeStats) {
      try {
        const usages = await ApiUsage.find({ api_key_id: k.key_id }, 'request_cost total_tokens').lean();
        totalRequests = usages.length;
        for (const u of usages) {
          totalCost += (u.request_cost || 0);
          totalTokens += (u.total_tokens || 0);
        }
      } catch (e) {
        logger.warn(`Could not compute usage for key ${k.key_id}:`, e.message);
      }
    }

    results.push({
      id: k.key_id,
      key_id: k.key_id,
      name: k.name,
      masked_key: k.masked_key,
      status: k.status,
      is_default: Boolean(k.is_default),
      created_at: k.created_at,
      updated_at: k.updated_at,
      last_used_at: k.last_used_at,
      total_requests: totalRequests,
      total_cost: Number(totalCost.toFixed(6)),
      total_tokens: totalTokens
    });
  }

  return results;
}

/**
 * Retrieve a single API key by ID
 * @param {number} keyId
 * @param {boolean} returnDecrypted - internal use only by Claude runner
 */
async function getApiKeyById(keyId, returnDecrypted = false) {
  const numericId = parseInt(keyId, 10);
  if (!numericId) return null;

  const doc = await ApiKey.findOne({ key_id: numericId }).lean();
  if (!doc) return null;

  if (returnDecrypted) {
    return {
      ...doc,
      decrypted_key: decryptKey(doc.encrypted_key)
    };
  }

  return {
    id: doc.key_id,
    key_id: doc.key_id,
    name: doc.name,
    masked_key: doc.masked_key,
    status: doc.status,
    is_default: Boolean(doc.is_default),
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    last_used_at: doc.last_used_at
  };
}

/**
 * Resolve the currently active or requested API key for Claude API execution
 * @param {number|string|null} requestedKeyId
 */
async function resolveClaudeKey(requestedKeyId = null) {
  await ensureDefaultKey();

  if (requestedKeyId && requestedKeyId !== 'all') {
    const key = await getApiKeyById(requestedKeyId, true);
    if (key && key.status === 'ACTIVE' && key.decrypted_key) {
      return {
        key_id: key.key_id,
        name: key.name,
        apiKey: key.decrypted_key,
        masked_key: key.masked_key
      };
    }
  }

  // Fallback 1: Default active key in DB
  const defaultKey = await ApiKey.findOne({ status: 'ACTIVE', is_default: true }).lean();
  if (defaultKey) {
    const decrypted = decryptKey(defaultKey.encrypted_key);
    if (decrypted) {
      return {
        key_id: defaultKey.key_id,
        name: defaultKey.name,
        apiKey: decrypted,
        masked_key: defaultKey.masked_key
      };
    }
  }

  // Fallback 2: Any active key in DB
  const firstActive = await ApiKey.findOne({ status: 'ACTIVE' }).sort({ created_at: 1 }).lean();
  if (firstActive) {
    const decrypted = decryptKey(firstActive.encrypted_key);
    if (decrypted) {
      return {
        key_id: firstActive.key_id,
        name: firstActive.name,
        apiKey: decrypted,
        masked_key: firstActive.masked_key
      };
    }
  }

  // Fallback 3: Environment Variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    return {
      key_id: 1,
      name: 'Default Environment Key',
      apiKey: envKey.trim(),
      masked_key: maskKey(envKey.trim())
    };
  }

  throw new Error('No active Claude API key configured. Please add an API key in Settings.');
}

/**
 * Create a new dynamic Claude API key
 */
async function createApiKey({ name, apiKey, isDefault = false }) {
  if (!name || !name.trim()) {
    throw new Error('API key name is required.');
  }

  const cleanKey = (apiKey || '').trim();
  if (!cleanKey.startsWith('sk-ant-') || cleanKey.length < 25) {
    throw new Error('Invalid Anthropic API key format. Key must start with "sk-ant-" and be valid.');
  }

  const keyId = await getNextSequence('key_id');
  const encrypted = encryptKey(cleanKey);
  const masked = maskKey(cleanKey);

  const existingCount = await ApiKey.countDocuments();
  const makeDefault = isDefault || existingCount === 0;

  if (makeDefault) {
    await ApiKey.updateMany({}, { is_default: false });
  }

  const doc = await ApiKey.create({
    key_id: keyId,
    name: name.trim(),
    encrypted_key: encrypted,
    masked_key: masked,
    status: 'ACTIVE',
    is_default: makeDefault,
    created_at: new Date(),
    updated_at: new Date()
  });

  return {
    id: doc.key_id,
    key_id: doc.key_id,
    name: doc.name,
    masked_key: doc.masked_key,
    status: doc.status,
    is_default: doc.is_default,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    total_requests: 0,
    total_cost: 0.0,
    total_tokens: 0
  };
}

/**
 * Update an existing API key
 */
async function updateApiKey(keyId, { name, status, isDefault, apiKey }) {
  const numericId = parseInt(keyId, 10);
  const doc = await ApiKey.findOne({ key_id: numericId });
  if (!doc) {
    throw new Error(`API key with ID ${keyId} not found.`);
  }

  if (name && name.trim()) {
    doc.name = name.trim();
  }

  if (status && ['ACTIVE', 'INACTIVE'].includes(status)) {
    doc.status = status;
  }

  if (apiKey && apiKey.trim()) {
    const clean = apiKey.trim();
    if (!clean.startsWith('sk-ant-') || clean.length < 25) {
      throw new Error('Invalid Anthropic API key format. Key must start with "sk-ant-".');
    }
    doc.encrypted_key = encryptKey(clean);
    doc.masked_key = maskKey(clean);
  }

  if (isDefault) {
    await ApiKey.updateMany({ key_id: { $ne: numericId } }, { is_default: false });
    doc.is_default = true;
  }

  doc.updated_at = new Date();
  await doc.save();

  return {
    id: doc.key_id,
    key_id: doc.key_id,
    name: doc.name,
    masked_key: doc.masked_key,
    status: doc.status,
    is_default: doc.is_default,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    last_used_at: doc.last_used_at
  };
}

/**
 * Delete an API key
 */
async function deleteApiKey(keyId) {
  const numericId = parseInt(keyId, 10);
  const doc = await ApiKey.findOne({ key_id: numericId });
  if (!doc) {
    throw new Error(`API key with ID ${keyId} not found.`);
  }

  await ApiKey.deleteOne({ key_id: numericId });

  // If deleted key was default, designate another active key as default
  if (doc.is_default) {
    const nextKey = await ApiKey.findOne({ status: 'ACTIVE' }).sort({ created_at: 1 });
    if (nextKey) {
      nextKey.is_default = true;
      await nextKey.save();
    }
  }

  return { success: true, message: `API key ${numericId} deleted successfully.` };
}

/**
 * Mark API key as used
 */
async function touchApiKey(keyId) {
  if (!keyId) return;
  try {
    await ApiKey.updateOne({ key_id: Number(keyId) }, { last_used_at: new Date() });
  } catch {}
}

/**
 * Automatically ensure at least one default key exists from .env
 */
async function ensureDefaultKey() {
  try {
    const existingDefault = await ApiKey.findOne({ is_default: true });
    if (!existingDefault && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      const plain = process.env.ANTHROPIC_API_KEY.trim();
      const encrypted = encryptKey(plain);
      const masked = maskKey(plain);

      await ApiKey.findOneAndUpdate(
        { key_id: 1 },
        {
          $setOnInsert: {
            key_id: 1,
            name: 'Primary API Key (Default)',
            encrypted_key: encrypted,
            masked_key: masked,
            status: 'ACTIVE',
            is_default: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        },
        { upsert: true }
      );
      logger.info('Auto-seeded default API key from environment into MongoDB Atlas.');
    }

    // Seed secondary key if provided via environment
    const secondaryPlain = (process.env.ANTHROPIC_SECONDARY_KEY || '').trim();
    const existingSecondary = await ApiKey.findOne({ key_id: 2 });
    if (!existingSecondary && secondaryPlain && secondaryPlain.startsWith('sk-ant-')) {
      await ApiKey.create({
        key_id: 2,
        name: 'Secondary API Key',
        encrypted_key: encryptKey(secondaryPlain),
        masked_key: maskKey(secondaryPlain),
        status: 'ACTIVE',
        is_default: false,
        created_at: new Date(),
        updated_at: new Date()
      });
      logger.info('Auto-seeded secondary API key into MongoDB Atlas.');
    }
  } catch (err) {
    logger.warn('Warning during ensureDefaultKey:', err.message);
  }
}

/**
 * Test connectivity with Anthropic API
 */
async function testKeyConnectivity(plainOrEncryptedKey) {
  let rawKey = plainOrEncryptedKey;
  if (!rawKey.startsWith('sk-ant-')) {
    rawKey = decryptKey(plainOrEncryptedKey);
  }

  if (!rawKey || !rawKey.startsWith('sk-ant-')) {
    return { valid: false, error: 'Invalid API key format.' };
  }

  try {
    const client = new Anthropic({
      apiKey: rawKey,
      fetch: globalThis.fetch
    });

    // Test with lightweight call
    await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Ping' }]
    });

    return { valid: true, message: 'Anthropic API key verified successfully.' };
  } catch (err) {
    return { valid: false, error: err.message || 'API key verification failed.' };
  }
}

module.exports = {
  encryptKey,
  decryptKey,
  maskKey,
  listApiKeys,
  getApiKeyById,
  resolveClaudeKey,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  touchApiKey,
  ensureDefaultKey,
  testKeyConnectivity
};
