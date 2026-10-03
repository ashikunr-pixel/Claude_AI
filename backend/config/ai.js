const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

function isApiKeyConfigured() {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.trim().length > 0 && !key.includes('your_api_key_here'));
}

function getMaskedApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!isApiKeyConfigured()) {
    return 'Not Configured';
  }
  const clean = key.trim();
  if (clean.length <= 8) return '****';
  return `${clean.substring(0, 10)}...${clean.substring(clean.length - 4)}`;
}

const clientPool = new Map();

function getAnthropicClient(apiKeyString = null) {
  const activeKey = (apiKeyString || process.env.ANTHROPIC_API_KEY || '').trim();

  if (!activeKey || !activeKey.startsWith('sk-ant-')) {
    throw new Error('Anthropic API key is not configured or invalid. Please configure an active API key.');
  }

  if (!clientPool.has(activeKey)) {
    clientPool.set(
      activeKey,
      new Anthropic({
        apiKey: activeKey,
        fetch: globalThis.fetch
      })
    );
  }

  return clientPool.get(activeKey);
}

module.exports = {
  getAnthropicClient,
  isApiKeyConfigured,
  getMaskedApiKey,
  DEFAULT_MODEL
};
