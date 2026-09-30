/**
 * Token Service
 * Responsible for token estimation and parsing actual provider usage
 */

/**
 * Heuristic token estimator for pre-flight cost checks.
 * English prose and code averages roughly 3.8 to 4 characters per token.
 * @param {string} text 
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const cleaned = text.trim();
  if (cleaned.length === 0) return 0;
  
  // Refined heuristic: counts words and punctuation
  const words = cleaned.split(/\s+/).length;
  const chars = cleaned.length;
  const byChars = Math.ceil(chars / 3.8);
  const byWords = Math.ceil(words * 1.3);

  return Math.max(Math.ceil((byChars + byWords) / 2), 1);
}

/**
 * Extract actual tokens from Anthropic API response usage object
 * @param {Object} usage - Anthropic response.usage
 * @returns {Object} Extracted token metrics
 */
function extractUsageTokens(usage) {
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0
    };
  }

  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const cacheCreationTokens = Number(usage.cache_creation_input_tokens || 0);
  const cacheReadTokens = Number(usage.cache_read_input_tokens || 0);

  // Total tokens = input + output + any provider cache additions
  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheCreationTokens,
    cacheReadTokens
  };
}

module.exports = {
  estimateTokens,
  extractUsageTokens
};
