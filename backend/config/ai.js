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

let clientInstance = null;

function getAnthropicClient() {
  if (!isApiKeyConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not configured in .env file. Please add your Anthropic API key to .env.');
  }

  if (!clientInstance) {
    clientInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY.trim(),
      fetch: globalThis.fetch
    });
  }

  return clientInstance;
}

module.exports = {
  getAnthropicClient,
  isApiKeyConfigured,
  getMaskedApiKey,
  DEFAULT_MODEL
};
