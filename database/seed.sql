-- ==============================================================================
-- Claude AI Platform - SQL Server Database Seed Data
-- ==============================================================================

USE ClaudeAI_DB;
GO

-- 1. Insert Default Budget Settings ($5.00 Application Safety Budget)
IF NOT EXISTS (SELECT 1 FROM dbo.budget_settings)
BEGIN
    INSERT INTO dbo.budget_settings (budget_usd, warning_threshold, hard_stop_enabled)
    VALUES (5.0000, 80, 0);
END
GO

-- 2. Insert Default Model Pricing (Configurable pricing table - no hard-coding)
IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-3-7-sonnet-20250219')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-3-7-sonnet-20250219', 3.0000, 15.0000, 0.3000, 3.7500, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-3-5-sonnet-20241022')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-3-5-sonnet-20241022', 3.0000, 15.0000, 0.3000, 3.7500, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-3-5-haiku-20241022')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-3-5-haiku-20241022', 0.8000, 4.0000, 0.0800, 1.0000, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-3-opus-20240229')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-3-opus-20240229', 15.0000, 75.0000, 1.5000, 18.7500, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-sonnet-4-6')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-sonnet-4-6', 3.0000, 15.0000, 0.3000, 3.7500, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.model_pricing WHERE model = 'claude-opus-4-6')
BEGIN
    INSERT INTO dbo.model_pricing (provider, model, input_price_per_million, output_price_per_million, cache_read_price, cache_write_price, is_active)
    VALUES ('anthropic', 'claude-opus-4-6', 15.0000, 75.0000, 1.5000, 18.7500, 1);
END
GO

-- 3. Insert AI Features Catalog
MERGE INTO dbo.ai_features AS target
USING (VALUES
    -- Text AI
    ('AI Chat', 'Text AI', 'Interactive conversational assistant'),
    ('Text Generation', 'Text AI', 'High-quality content and narrative generation'),
    ('Summarization', 'Text AI', 'Condensing text into key actionable insights'),
    ('Rewriting', 'Text AI', 'Transforming tone, style, and flow'),
    ('Grammar Improvement', 'Text AI', 'Correcting syntax, punctuation, and phrasing'),
    ('Translation', 'Text AI', 'Accurate multi-language translation'),
    ('Text Analysis', 'Text AI', 'Deep semantic, tone, and readability analysis'),
    ('Information Extraction', 'Text AI', 'Extracting entities, dates, facts, and figures'),
    ('Classification', 'Text AI', 'Categorizing content into defined taxonomies'),
    ('Sentiment Analysis', 'Text AI', 'Evaluating sentiment, tone, and subjective perspective'),
    ('Question Answering', 'Text AI', 'Direct, fact-based answers from provided context'),
    ('Structured Output', 'Text AI', 'Standardized schemas and formatted tables'),
    ('JSON Generation', 'Text AI', 'Strict, schema-valid JSON generation'),
    ('Content Transformation', 'Text AI', 'Refactoring content between formats and registers'),
    
    -- Document AI
    ('Document Summarization', 'Document AI', 'Multi-page document summarization and highlights'),
    ('Document Q&A', 'Document AI', 'Targeted answers grounded in uploaded document content'),
    ('Document Analysis', 'Document AI', 'Deep architectural and semantic document review'),
    ('Document Information Extraction', 'Document AI', 'Structured field extraction from uploaded files'),
    ('Document Comparison', 'Document AI', 'Side-by-side differential analysis of documents'),
    
    -- Developer AI
    ('Code Explanation', 'Developer AI', 'Step-by-step breakdown of algorithms and routines'),
    ('Code Generation', 'Developer AI', 'Clean, production-grade code implementation'),
    ('Code Review', 'Developer AI', 'Security, efficiency, and code quality audits'),
    ('Bug/Error Analysis', 'Developer AI', 'Diagnosing stack traces and logical errors'),
    ('Code Optimization', 'Developer AI', 'Performance tuning and algorithmic refactoring'),
    ('SQL Generation', 'Developer AI', 'Writing complex SQL queries and schemas'),
    ('SQL Explanation', 'Developer AI', 'Explaining query execution and relational logic'),
    ('Documentation Generation', 'Developer AI', 'Creating API docs, docstrings, and markdown guides'),
    
    -- Professional AI
    ('Resume Analysis', 'Professional AI', 'ATS compatibility and skill gap auditing'),
    ('Resume Improvement', 'Professional AI', 'Impactful bullet points and executive summary crafting'),
    ('Cover Letter Generation', 'Professional AI', 'Tailored, persuasive cover letters'),
    ('Email Generation', 'Professional AI', 'Polished executive, sales, or client communications'),
    ('Report Generation', 'Professional AI', 'Comprehensive business and technical reports'),
    ('Meeting Summary', 'Professional AI', 'Action items, decisions, and minutes from transcripts'),
    ('Job Description Analysis', 'Professional AI', 'Auditing requirements and competitiveness'),
    
    -- Education AI
    ('Topic Explanation', 'Education AI', 'Pedagogical breakdowns from first principles'),
    ('Study Notes', 'Education AI', 'Structured chapter outlines and revision guides'),
    ('Question Generation', 'Education AI', 'Targeted comprehension and practice questions'),
    ('MCQ Generation', 'Education AI', 'Multiple choice questions with explanations'),
    ('Flashcards', 'Education AI', 'Anki-ready Q&A card sets'),
    ('Exam Preparation', 'Education AI', 'Comprehensive mock exams and rubric criteria'),
    ('Q&A from Uploaded Material', 'Education AI', 'Grounding quizzes in user textbook or notes'),
    
    -- Core Optimization & Tasks
    ('Custom AI', 'Custom AI', 'User-defined prompt and task specifications'),
    ('Prompt Optimization', 'Core Engine', 'Systemic prompt refinement and structural improvements'),
    ('File Text Extraction', 'File Processing', 'Native and parsed text extraction from uploaded documents'),
    ('Duplicate Content Removal', 'Runtime Optimization', 'Deduplicating redundant context blocks')
) AS source (feature_name, category, description)
ON target.feature_name = source.feature_name
WHEN NOT MATCHED THEN
    INSERT (feature_name, category, description)
    VALUES (source.feature_name, source.category, source.description);
GO

-- 4. Insert Default Users (Admin: admin@claude.ai / Password: AdminPassword123!)
-- Hash generated using bcrypt $2a$10$wE6b/nJ6s2E1VqO8eQf.reP/y2KzD7w8v8Xo8aF0Xo4UvK...
-- We will also run a JS seed script to ensure reliable bcrypt matches
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'admin@claude.ai')
BEGIN
    INSERT INTO dbo.users (name, email, password_hash, role)
    VALUES ('System Administrator', 'admin@claude.ai', '$2a$10$K9Wl6q36eR8q1oZkWq0B7e9wE2kZ4E6b4yUeZgMhW4e3WqG6lqP6S', 'ADMIN');
END

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'user@claude.ai')
BEGIN
    INSERT INTO dbo.users (name, email, password_hash, role)
    VALUES ('Demo User', 'user@claude.ai', '$2a$10$K9Wl6q36eR8q1oZkWq0B7e9wE2kZ4E6b4yUeZgMhW4e3WqG6lqP6S', 'USER');
END
GO
