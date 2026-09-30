const db = require('./database');

// Default fallback pricing table (price per 1,000,000 tokens in USD)
const FALLBACK_PRICING = {
  'claude-3-7-sonnet-20250219': { input: 3.00, output: 15.00, cache_read: 0.30, cache_write: 3.75 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cache_read: 0.30, cache_write: 3.75 },
  'claude-3-5-haiku-20241022':  { input: 0.80, output: 4.00,  cache_read: 0.08, cache_write: 1.00 },
  'claude-3-opus-20240229':    { input: 15.00, output: 75.00, cache_read: 1.50, cache_write: 18.75 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00, cache_read: 0.30, cache_write: 3.75 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00, cache_read: 1.50, cache_write: 18.75 }
};

let pricingCache = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

async function getActiveModelPricing() {
  const now = Date.now();
  if (pricingCache && (now - lastFetchTime) < CACHE_TTL_MS) {
    return pricingCache;
  }

  try {
    const result = await db.query(
      `SELECT model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price 
       FROM dbo.model_pricing 
       WHERE is_active = 1`
    );

    const pricing = {};
    for (const row of result.recordset) {
      pricing[row.model] = {
        input: parseFloat(row.input_price_per_million),
        output: parseFloat(row.output_price_per_million),
        cache_read: parseFloat(row.cache_read_price || 0),
        cache_write: parseFloat(row.cache_write_price || 0)
      };
    }

    if (Object.keys(pricing).length > 0) {
      pricingCache = pricing;
      lastFetchTime = now;
      return pricing;
    }
  } catch (err) {
    console.warn('[Pricing] Could not load from DB, falling back to defaults:', err.message);
  }

  return FALLBACK_PRICING;
}

async function getModelRates(modelName) {
  const pricing = await getActiveModelPricing();
  if (pricing[modelName]) {
    return pricing[modelName];
  }
  // Try partial match or fallback to Sonnet
  for (const key of Object.keys(pricing)) {
    if (modelName && modelName.includes(key)) return pricing[key];
  }
  return FALLBACK_PRICING['claude-3-7-sonnet-20250219'];
}

module.exports = {
  getActiveModelPricing,
  getModelRates,
  FALLBACK_PRICING
};
