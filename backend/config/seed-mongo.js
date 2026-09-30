const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const {
  Counter,
  User,
  ModelPricing,
  AiFeature,
  BudgetSetting
} = require('../models');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ashikakbarunr_db_user:Mount321@claudeai.oq3avmi.mongodb.net/claude_ai_platform?retryWrites=true&w=majority&appName=claudeai';

async function seedMongo() {
  console.log('[Mongo Seed] Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log('[Mongo Seed] Successfully connected to MongoDB Atlas!');

    // 1. Budget Settings
    const existingBudget = await BudgetSetting.findOne({ setting_id: 1 });
    if (!existingBudget) {
      await BudgetSetting.create({
        setting_id: 1,
        budget_usd: 5.0,
        warning_threshold: 80,
        hard_stop_enabled: false
      });
      console.log('[Mongo Seed] Inserted default $5.00 budget setting.');
    }

    // 2. Model Pricing
    const defaultModels = [
      { provider: 'anthropic', model: 'claude-sonnet-4-6', input_price_per_million: 3.0, output_price_per_million: 15.0, cache_read_price: 0.3, cache_write_price: 3.75, is_active: true },
      { provider: 'anthropic', model: 'claude-opus-4-6', input_price_per_million: 15.0, output_price_per_million: 75.0, cache_read_price: 1.5, cache_write_price: 18.75, is_active: true },
      { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', input_price_per_million: 3.0, output_price_per_million: 15.0, cache_read_price: 0.3, cache_write_price: 3.75, is_active: true },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', input_price_per_million: 3.0, output_price_per_million: 15.0, cache_read_price: 0.3, cache_write_price: 3.75, is_active: true },
      { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', input_price_per_million: 0.8, output_price_per_million: 4.0, cache_read_price: 0.08, cache_write_price: 1.0, is_active: true },
      { provider: 'anthropic', model: 'claude-3-opus-20240229', input_price_per_million: 15.0, output_price_per_million: 75.0, cache_read_price: 1.5, cache_write_price: 18.75, is_active: true }
    ];

    let pricingId = 1;
    for (const m of defaultModels) {
      await ModelPricing.findOneAndUpdate(
        { model: m.model },
        { ...m, pricing_id: pricingId++ },
        { upsert: true, new: true }
      );
    }
    console.log('[Mongo Seed] Model pricing seeded (6 models).');

    // 3. AI Features Catalog (45 features)
    const features = [
      // Text AI
      { feature_name: 'AI Chat', category: 'Text AI', description: 'Interactive conversational assistant' },
      { feature_name: 'Text Generation', category: 'Text AI', description: 'High-quality content and narrative generation' },
      { feature_name: 'Summarization', category: 'Text AI', description: 'Condensing text into key actionable insights' },
      { feature_name: 'Rewriting', category: 'Text AI', description: 'Transforming tone, style, and flow' },
      { feature_name: 'Grammar Improvement', category: 'Text AI', description: 'Correcting syntax, punctuation, and phrasing' },
      { feature_name: 'Translation', category: 'Text AI', description: 'Accurate multi-language translation' },
      { feature_name: 'Text Analysis', category: 'Text AI', description: 'Deep semantic, tone, and readability analysis' },
      { feature_name: 'Information Extraction', category: 'Text AI', description: 'Extracting entities, dates, facts, and figures' },
      { feature_name: 'Classification', category: 'Text AI', description: 'Categorizing content into defined taxonomies' },
      { feature_name: 'Sentiment Analysis', category: 'Text AI', description: 'Evaluating sentiment, tone, and subjective perspective' },
      { feature_name: 'Question Answering', category: 'Text AI', description: 'Direct, fact-based answers from provided context' },
      { feature_name: 'Structured Output', category: 'Text AI', description: 'Standardized schemas and formatted tables' },
      { feature_name: 'JSON Generation', category: 'Text AI', description: 'Strict, schema-valid JSON generation' },
      { feature_name: 'Content Transformation', category: 'Text AI', description: 'Refactoring content between formats and registers' },

      // Document AI
      { feature_name: 'Document Summarization', category: 'Document AI', description: 'Multi-page document summarization and highlights' },
      { feature_name: 'Document Q&A', category: 'Document AI', description: 'Targeted answers grounded in uploaded document content' },
      { feature_name: 'Document Analysis', category: 'Document AI', description: 'Deep architectural and semantic document review' },
      { feature_name: 'Document Information Extraction', category: 'Document AI', description: 'Structured field extraction from uploaded files' },
      { feature_name: 'Document Comparison', category: 'Document AI', description: 'Side-by-side differential analysis of documents' },

      // Developer AI
      { feature_name: 'Code Explanation', category: 'Developer AI', description: 'Step-by-step breakdown of algorithms and routines' },
      { feature_name: 'Code Generation', category: 'Developer AI', description: 'Clean, production-grade code implementation' },
      { feature_name: 'Code Review', category: 'Developer AI', description: 'Security, efficiency, and code quality audits' },
      { feature_name: 'Bug/Error Analysis', category: 'Developer AI', description: 'Diagnosing stack traces and logical errors' },
      { feature_name: 'Code Optimization', category: 'Developer AI', description: 'Performance tuning and algorithmic refactoring' },
      { feature_name: 'SQL Generation', category: 'Developer AI', description: 'Writing complex SQL queries and schemas' },
      { feature_name: 'SQL Explanation', category: 'Developer AI', description: 'Explaining query execution and relational logic' },
      { feature_name: 'Documentation Generation', category: 'Developer AI', description: 'Creating API docs, docstrings, and markdown guides' },

      // Professional AI
      { feature_name: 'Resume Analysis', category: 'Professional AI', description: 'ATS compatibility and skill gap auditing' },
      { feature_name: 'Resume Improvement', category: 'Professional AI', description: 'Impactful bullet points and executive summary crafting' },
      { feature_name: 'Cover Letter Generation', category: 'Professional AI', description: 'Tailored, persuasive cover letters' },
      { feature_name: 'Email Generation', category: 'Professional AI', description: 'Polished executive, sales, or client communications' },
      { feature_name: 'Report Generation', category: 'Professional AI', description: 'Comprehensive business and technical reports' },
      { feature_name: 'Meeting Summary', category: 'Professional AI', description: 'Action items, decisions, and minutes from transcripts' },
      { feature_name: 'Job Description Analysis', category: 'Professional AI', description: 'Auditing requirements and competitiveness' },

      // Education AI
      { feature_name: 'Topic Explanation', category: 'Education AI', description: 'Pedagogical breakdowns from first principles' },
      { feature_name: 'Study Guide Creation', category: 'Education AI', description: 'Structured revision materials and practice syllabi' },
      { feature_name: 'Quiz Generation', category: 'Education AI', description: 'Multiple-choice and open-ended knowledge assessments' },
      { feature_name: 'Complex Concept Simplification', category: 'Education AI', description: 'ELI5 and intuitive analogies for intricate concepts' },
      { feature_name: 'Flashcard Generation', category: 'Education AI', description: 'Anki/spaced-repetition question-answer pairs' },

      // Creative AI
      { feature_name: 'Creative Writing', category: 'Creative AI', description: 'Novels, flash fiction, poetry, and world-building' },
      { feature_name: 'Brainstorming', category: 'Creative AI', description: 'Ideation sessions and divergent lateral thinking' },
      { feature_name: 'Headline Generation', category: 'Creative AI', description: 'High-CTR copy, subject lines, and marketing hooks' },
      { feature_name: 'Outline Creation', category: 'Creative AI', description: 'Hierarchical structure for books, essays, and talks' },
      { feature_name: 'Story Development', category: 'Creative AI', description: 'Character arcs, narrative tension, and plot crafting' }
    ];

    let featId = 1;
    for (const f of features) {
      await AiFeature.findOneAndUpdate(
        { feature_name: f.feature_name },
        { ...f, feature_id: featId++ },
        { upsert: true, new: true }
      );
    }
    console.log(`[Mongo Seed] Seeded ${features.length} AI features.`);

    // 4. Default Users
    const salt = await bcrypt.genSalt(10);
    const adminPassHash = await bcrypt.hash('AdminPassword123!', salt);
    const userPassHash = await bcrypt.hash('UserPassword123!', salt);

    await User.findOneAndUpdate(
      { email: 'admin@claude.ai' },
      {
        user_id: 1,
        name: 'Administrator',
        email: 'admin@claude.ai',
        password_hash: adminPassHash,
        role: 'ADMIN'
      },
      { upsert: true, new: true }
    );

    await User.findOneAndUpdate(
      { email: 'user@claude.ai' },
      {
        user_id: 2,
        name: 'Standard User',
        email: 'user@claude.ai',
        password_hash: userPassHash,
        role: 'USER'
      },
      { upsert: true, new: true }
    );

    // Initialize sequence counter
    await Counter.findByIdAndUpdate('user_id', { seq: 2 }, { upsert: true });
    await Counter.findByIdAndUpdate('task_id', { seq: 1 }, { upsert: true });
    await Counter.findByIdAndUpdate('file_id', { seq: 1 }, { upsert: true });
    await Counter.findByIdAndUpdate('prompt_id', { seq: 1 }, { upsert: true });
    await Counter.findByIdAndUpdate('request_id', { seq: 1 }, { upsert: true });
    await Counter.findByIdAndUpdate('usage_id', { seq: 1 }, { upsert: true });
    await Counter.findByIdAndUpdate('result_id', { seq: 1 }, { upsert: true });

    console.log('[Mongo Seed] Seed complete: Users, counters, pricing, and features ready.');
    if (require.main === module) {
      process.exit(0);
    }
  } catch (err) {
    console.error('[Mongo Seed] Seed failed:', err.message);
    if (require.main === module) {
      process.exit(1);
    }
    throw err;
  }
}

if (require.main === module) {
  seedMongo();
}

module.exports = seedMongo;
