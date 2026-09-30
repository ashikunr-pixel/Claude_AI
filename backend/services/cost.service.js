const { getModelRates } = require('../config/pricing');

/**
 * Cost calculation service
 * Uses dynamic model pricing from SQL Server database
 */
async function calculateRequestCost(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const rates = await getModelRates(model);

  const inputCost = (inputTokens / 1000000) * rates.input;
  const outputCost = (outputTokens / 1000000) * rates.output;
  const cacheReadCost = (cacheReadTokens / 1000000) * rates.cache_read;
  const cacheWriteCost = (cacheWriteTokens / 1000000) * rates.cache_write;

  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    cacheReadCost: Number(cacheReadCost.toFixed(6)),
    cacheWriteCost: Number(cacheWriteCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    rates
  };
}

/**
 * Estimate upper-bound cost before executing request
 * @param {string} model 
 * @param {number} estimatedInputTokens 
 * @param {number} maxOutputTokens 
 */
async function estimateRequestCost(model, estimatedInputTokens, maxOutputTokens = 1000) {
  const rates = await getModelRates(model);

  const estInputCost = (estimatedInputTokens / 1000000) * rates.input;
  // Estimate realistic output tokens as min(maxOutputTokens, expected proportional output)
  const estOutputCost = (maxOutputTokens / 1000000) * rates.output;
  const estTotalCost = estInputCost + estOutputCost;

  return {
    estimatedInputCost: Number(estInputCost.toFixed(6)),
    estimatedOutputCost: Number(estOutputCost.toFixed(6)),
    estimatedTotalCost: Number(estTotalCost.toFixed(6)),
    rates
  };
}

module.exports = {
  calculateRequestCost,
  estimateRequestCost
};
