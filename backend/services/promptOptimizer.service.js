const { estimateTokens } = require('./token.service');
const { getAnthropicClient, isApiKeyConfigured } = require('../config/ai');

/**
 * Algorithmic prompt optimizer fallback
 */
function optimizePromptRuleBased(originalPrompt, mode = 'Optimized') {
  const cleanPrompt = (originalPrompt || '').trim();

  if (mode === 'Standard') {
    return {
      originalPrompt: cleanPrompt,
      optimizedPrompt: cleanPrompt,
      changesSummary: 'Standard mode preserved your original prompt as entered without modifications.',
      tokenDiff: 0,
      mode: 'Standard'
    };
  }

  if (mode === 'Maximum Efficiency') {
    // Strip fluff words: "Please", "Could you kindly", "I would like you to", "In order to", etc.
    let stripped = cleanPrompt
      .replace(/^(please\s+|kindly\s+|could you\s+(please\s+)?|i want you to\s+|i need you to\s+|can you\s+)/i, '')
      .replace(/\b(in order to|as a matter of fact|at the end of the day|it should be noted that)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Capitalize first letter
    stripped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    const optimizedPrompt = `${stripped}\nProvide a concise, direct response without filler phrases or conversational preamble.`;

    const origTokens = estimateTokens(cleanPrompt);
    const optTokens = estimateTokens(optimizedPrompt);

    return {
      originalPrompt: cleanPrompt,
      optimizedPrompt,
      changesSummary: 'Removed conversational filler and conversational preamble; enforced token-efficient output constraint.',
      tokenDiff: optTokens - origTokens,
      mode: 'Maximum Efficiency'
    };
  }

  // 'Optimized' Mode (Default)
  let structured = cleanPrompt;
  const lower = cleanPrompt.toLowerCase();

  let roleContext = 'You are an expert AI specialist.';
  let outputFormat = 'Structure the response with clear headings, bullet points for key takeaways, and an actionable conclusion.';

  if (lower.includes('summar') || lower.includes('brief') || lower.includes('tldr')) {
    roleContext = 'You are an executive summarization specialist.';
    outputFormat = 'Format with: 1. Executive Summary, 2. Key Insights & Decisions, 3. Critical Action Items.';
  } else if (lower.includes('code') || lower.includes('debug') || lower.includes('function') || lower.includes('sql') || lower.includes('api')) {
    roleContext = 'You are a senior software engineer and system architect.';
    outputFormat = 'Format with: 1. Technical Explanation, 2. Production-Ready Code Implementation with comments, 3. Edge Cases & Complexity Analysis.';
  } else if (lower.includes('resume') || lower.includes('job') || lower.includes('cover letter') || lower.includes('interview')) {
    roleContext = 'You are an executive career advisor and talent recruitment strategist.';
    outputFormat = 'Format with: 1. ATS & Impact Analysis, 2. Action-Driven Improvements, 3. Tailored Final Content.';
  } else if (lower.includes('explain') || lower.includes('teach') || lower.includes('notes') || lower.includes('study')) {
    roleContext = 'You are a master educator skilled in pedagogical clarity and first-principles reasoning.';
    outputFormat = 'Format with: 1. Core Intuition & Definitions, 2. Step-by-Step Breakdown with concrete examples, 3. Review Checkpoint Questions.';
  }

  const optimizedPrompt = `[Objective]: ${cleanPrompt}

[Role]: ${roleContext}

[Instructions]:
- Carefully analyze the provided context or text.
- Address all core requirements with technical precision and factual grounding.
- Highlight any ambiguities or important caveats.

[Output Format]:
${outputFormat}`;

  const origTokens = estimateTokens(cleanPrompt);
  const optTokens = estimateTokens(optimizedPrompt);

  return {
    originalPrompt: cleanPrompt,
    optimizedPrompt,
    changesSummary: 'Added explicit role framing, structured instruction hierarchy, and structured output formatting guidelines.',
    tokenDiff: optTokens - origTokens,
    mode: 'Optimized'
  };
}

/**
 * Optimize prompt using Claude API when available, falling back to algorithmic optimization
 * @param {string} prompt 
 * @param {string} mode - 'Standard' | 'Optimized' | 'Maximum Efficiency'
 */
async function optimizePrompt(prompt, mode = 'Optimized') {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt text is required for optimization.');
  }

  const cleanPrompt = prompt.trim();
  if (cleanPrompt.length === 0) {
    throw new Error('Prompt cannot be empty.');
  }

  if (mode === 'Standard') {
    return optimizePromptRuleBased(cleanPrompt, 'Standard');
  }

  // If Claude API key is configured, use Claude for high-end prompt engineering
  if (isApiKeyConfigured()) {
    try {
      const client = getAnthropicClient();
      const systemInstruction = `You are a world-class prompt engineer.
Your task is to take a user's prompt and refine it according to the requested mode: "${mode}".
- In "Optimized" mode: Enhance clarity, define explicit constraints, state expected output format, and improve structure.
- In "Maximum Efficiency" mode: Remove conversational fluff, eliminate redundancies, and tighten language to minimize tokens while maintaining prompt intent.

Respond strictly in valid JSON format with keys:
{
  "optimizedPrompt": "...",
  "changesSummary": "...",
  "estimatedTokenDiff": 0
}`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', // Use fast, cost-effective Haiku 4.5 for prompt optimization
        max_tokens: 600,
        system: systemInstruction,
        messages: [{ role: 'user', content: `Original Prompt: "${cleanPrompt}"\nMode: ${mode}` }]
      });

      const rawJson = response.content[0].text;
      const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const origTokens = estimateTokens(cleanPrompt);
        const optTokens = estimateTokens(parsed.optimizedPrompt);

        return {
          originalPrompt: cleanPrompt,
          optimizedPrompt: parsed.optimizedPrompt,
          changesSummary: parsed.changesSummary || 'Refined using Claude Prompt Optimization Engine.',
          tokenDiff: optTokens - origTokens,
          mode
        };
      }
    } catch (err) {
      console.warn('[PromptOptimizer] API optimization failed, using rule-based engine:', err.message);
    }
  }

  // Fallback to rule-based prompt engine
  return optimizePromptRuleBased(cleanPrompt, mode);
}

module.exports = {
  optimizePrompt,
  optimizePromptRuleBased
};
