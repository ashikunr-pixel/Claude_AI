const {
  listApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  testKeyConnectivity
} = require('../services/key.service');
const logger = require('../utils/logger');

async function getKeys(req, res, next) {
  try {
    const keys = await listApiKeys(true);
    res.json({
      success: true,
      data: keys
    });
  } catch (err) {
    next(err);
  }
}

async function getKey(req, res, next) {
  try {
    const key = await getApiKeyById(req.params.id);
    if (!key) {
      return res.status(404).json({ success: false, error: 'API key not found.' });
    }
    res.json({
      success: true,
      data: key
    });
  } catch (err) {
    next(err);
  }
}

async function addKey(req, res, next) {
  try {
    const { name, apiKey, isDefault, status } = req.body;

    if (!name || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Key name and a valid Anthropic API key (starting with sk-ant-) are required.'
      });
    }

    const newKey = await createApiKey({ name, apiKey, isDefault, status });

    await logger.audit(req.user?.user_id || 1, 'CREATE_API_KEY', 'API_KEY', newKey.key_id, {
      name: newKey.name,
      masked: newKey.masked_key
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'API key added successfully.',
      data: newKey
    });
  } catch (err) {
    next(err);
  }
}

async function modifyKey(req, res, next) {
  try {
    const keyId = req.params.id;
    const { name, apiKey, isDefault, status } = req.body;

    const updated = await updateApiKey(keyId, { name, apiKey, isDefault, status });

    await logger.audit(req.user?.user_id || 1, 'UPDATE_API_KEY', 'API_KEY', updated.key_id, {
      name: updated.name,
      status: updated.status
    }).catch(() => {});

    res.json({
      success: true,
      message: 'API key updated successfully.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

async function removeKey(req, res, next) {
  try {
    const keyId = req.params.id;
    const result = await deleteApiKey(keyId);

    await logger.audit(req.user?.user_id || 1, 'DELETE_API_KEY', 'API_KEY', Number(keyId), {
      deleted: result.deleted
    }).catch(() => {});

    res.json({
      success: true,
      message: 'API key deleted successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

async function testKey(req, res, next) {
  try {
    const { apiKey } = req.body;
    const keyId = req.params.id;

    let targetKey = apiKey;
    if (!targetKey && keyId) {
      const existing = await getApiKeyById(keyId, true);
      if (existing) {
        targetKey = existing.decrypted_key;
      }
    }

    if (!targetKey) {
      return res.status(400).json({ success: false, error: 'No API key provided or found to test.' });
    }

    const testRes = await testKeyConnectivity(targetKey);
    res.json({
      success: testRes.valid,
      message: testRes.valid ? testRes.message : testRes.error
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getKeys,
  getKey,
  addKey,
  modifyKey,
  removeKey,
  testKey
};
