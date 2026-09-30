-- ==============================================================================
-- Claude AI Platform - SQL Server Database Schema
-- Compatible with SQL Server 2016+, SQL Server Express, and SSMS
-- ==============================================================================

USE ClaudeAI_DB;
GO

-- Drop tables in reverse foreign key order if they already exist
IF OBJECT_ID('dbo.task_features', 'U') IS NOT NULL DROP TABLE dbo.task_features;
IF OBJECT_ID('dbo.generated_results', 'U') IS NOT NULL DROP TABLE dbo.generated_results;
IF OBJECT_ID('dbo.api_usage', 'U') IS NOT NULL DROP TABLE dbo.api_usage;
IF OBJECT_ID('dbo.api_requests', 'U') IS NOT NULL DROP TABLE dbo.api_requests;
IF OBJECT_ID('dbo.prompts', 'U') IS NOT NULL DROP TABLE dbo.prompts;
IF OBJECT_ID('dbo.files', 'U') IS NOT NULL DROP TABLE dbo.files;
IF OBJECT_ID('dbo.tasks', 'U') IS NOT NULL DROP TABLE dbo.tasks;
IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL DROP TABLE dbo.audit_logs;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
IF OBJECT_ID('dbo.model_pricing', 'U') IS NOT NULL DROP TABLE dbo.model_pricing;
IF OBJECT_ID('dbo.ai_features', 'U') IS NOT NULL DROP TABLE dbo.ai_features;
IF OBJECT_ID('dbo.budget_settings', 'U') IS NOT NULL DROP TABLE dbo.budget_settings;
GO

-- 1. Users
CREATE TABLE dbo.users (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) NOT NULL DEFAULT 'USER', -- 'ADMIN' or 'USER'
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- 2. Tasks
CREATE TABLE dbo.tasks (
    task_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    task_type NVARCHAR(50) NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    runtime_options NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    completed_at DATETIME2 NULL,
    CONSTRAINT FK_tasks_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE
);
GO

-- 3. Files
CREATE TABLE dbo.files (
    file_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    task_id INT NULL,
    file_name NVARCHAR(255) NOT NULL,
    file_type NVARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path NVARCHAR(500) NOT NULL,
    extracted_text NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_files_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE NO ACTION,
    CONSTRAINT FK_files_tasks FOREIGN KEY (task_id) REFERENCES dbo.tasks(task_id) ON DELETE SET NULL
);
GO

-- 4. Prompts
CREATE TABLE dbo.prompts (
    prompt_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NULL,
    original_prompt NVARCHAR(MAX) NOT NULL,
    optimized_prompt NVARCHAR(MAX) NULL,
    optimization_mode NVARCHAR(50) NULL, -- 'Standard', 'Optimized', 'Maximum Efficiency'
    changes_summary NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_prompts_tasks FOREIGN KEY (task_id) REFERENCES dbo.tasks(task_id) ON DELETE CASCADE
);
GO

-- 5. API Requests
CREATE TABLE dbo.api_requests (
    request_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NULL,
    user_id INT NOT NULL,
    model NVARCHAR(100) NOT NULL,
    provider NVARCHAR(50) NOT NULL DEFAULT 'anthropic',
    status NVARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED'
    processing_time_ms INT NULL,
    error_message NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_api_requests_tasks FOREIGN KEY (task_id) REFERENCES dbo.tasks(task_id) ON DELETE SET NULL,
    CONSTRAINT FK_api_requests_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE NO ACTION
);
GO

-- 6. API Usage (Per-request and Cumulative Tracking)
CREATE TABLE dbo.api_usage (
    usage_id INT IDENTITY(1,1) PRIMARY KEY,
    request_id INT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    cache_creation_tokens INT NOT NULL DEFAULT 0,
    cache_read_tokens INT NOT NULL DEFAULT 0,
    request_cost DECIMAL(18, 6) NOT NULL DEFAULT 0.000000,
    cumulative_cost DECIMAL(18, 6) NOT NULL DEFAULT 0.000000,
    remaining_budget DECIMAL(18, 6) NOT NULL DEFAULT 5.000000,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_api_usage_requests FOREIGN KEY (request_id) REFERENCES dbo.api_requests(request_id) ON DELETE CASCADE
);
GO

-- 7. Model Pricing (Configurable pricing table - no hard-coding)
CREATE TABLE dbo.model_pricing (
    pricing_id INT IDENTITY(1,1) PRIMARY KEY,
    provider NVARCHAR(50) NOT NULL DEFAULT 'anthropic',
    model NVARCHAR(100) NOT NULL,
    input_price_per_million DECIMAL(18, 4) NOT NULL,
    output_price_per_million DECIMAL(18, 4) NOT NULL,
    cache_read_price DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    cache_write_price DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    is_active BIT NOT NULL DEFAULT 1,
    effective_from DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    effective_to DATETIME2 NULL
);
GO

-- 8. AI Features Catalog
CREATE TABLE dbo.ai_features (
    feature_id INT IDENTITY(1,1) PRIMARY KEY,
    feature_name NVARCHAR(100) NOT NULL UNIQUE,
    category NVARCHAR(50) NOT NULL,
    description NVARCHAR(255) NULL
);
GO

-- 9. Task Features Link Table
CREATE TABLE dbo.task_features (
    task_id INT NOT NULL,
    feature_id INT NOT NULL,
    PRIMARY KEY (task_id, feature_id),
    CONSTRAINT FK_task_features_tasks FOREIGN KEY (task_id) REFERENCES dbo.tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_task_features_features FOREIGN KEY (feature_id) REFERENCES dbo.ai_features(feature_id) ON DELETE CASCADE
);
GO

-- 10. Generated Results
CREATE TABLE dbo.generated_results (
    result_id INT IDENTITY(1,1) PRIMARY KEY,
    task_id INT NOT NULL,
    request_id INT NULL,
    result_content NVARCHAR(MAX) NOT NULL,
    result_format NVARCHAR(20) NOT NULL DEFAULT 'markdown', -- 'text', 'markdown', 'json'
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_results_tasks FOREIGN KEY (task_id) REFERENCES dbo.tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT FK_results_requests FOREIGN KEY (request_id) REFERENCES dbo.api_requests(request_id) ON DELETE NO ACTION
);
GO

-- 11. Budget Settings ($5 Application Safety Budget)
CREATE TABLE dbo.budget_settings (
    budget_id INT IDENTITY(1,1) PRIMARY KEY,
    budget_usd DECIMAL(18, 4) NOT NULL DEFAULT 5.0000,
    warning_threshold INT NOT NULL DEFAULT 80, -- percentage
    hard_stop_enabled BIT NOT NULL DEFAULT 0,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- 12. Audit Logs
CREATE TABLE dbo.audit_logs (
    audit_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NULL,
    action NVARCHAR(100) NOT NULL,
    entity_type NVARCHAR(50) NOT NULL,
    entity_id INT NULL,
    details NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_audit_logs_users FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE SET NULL
);
GO
