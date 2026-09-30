-- ==============================================================================
-- Claude AI Platform - SQL Server Database Indexes
-- ==============================================================================

USE ClaudeAI_DB;
GO

-- Index for User lookup
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_users_email' AND object_id = OBJECT_ID('dbo.users'))
CREATE INDEX IX_users_email ON dbo.users(email);
GO

-- Indexes for Tasks
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tasks_user_id' AND object_id = OBJECT_ID('dbo.tasks'))
CREATE INDEX IX_tasks_user_id ON dbo.tasks(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tasks_status' AND object_id = OBJECT_ID('dbo.tasks'))
CREATE INDEX IX_tasks_status ON dbo.tasks(status);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tasks_created_at' AND object_id = OBJECT_ID('dbo.tasks'))
CREATE INDEX IX_tasks_created_at ON dbo.tasks(created_at DESC);
GO

-- Indexes for Files
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_files_user_id' AND object_id = OBJECT_ID('dbo.files'))
CREATE INDEX IX_files_user_id ON dbo.files(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_files_task_id' AND object_id = OBJECT_ID('dbo.files'))
CREATE INDEX IX_files_task_id ON dbo.files(task_id);
GO

-- Indexes for Prompts
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_prompts_task_id' AND object_id = OBJECT_ID('dbo.prompts'))
CREATE INDEX IX_prompts_task_id ON dbo.prompts(task_id);
GO

-- Indexes for API Requests
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_api_requests_user_id' AND object_id = OBJECT_ID('dbo.api_requests'))
CREATE INDEX IX_api_requests_user_id ON dbo.api_requests(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_api_requests_task_id' AND object_id = OBJECT_ID('dbo.api_requests'))
CREATE INDEX IX_api_requests_task_id ON dbo.api_requests(task_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_api_requests_created_at' AND object_id = OBJECT_ID('dbo.api_requests'))
CREATE INDEX IX_api_requests_created_at ON dbo.api_requests(created_at DESC);
GO

-- Indexes for API Usage
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_api_usage_request_id' AND object_id = OBJECT_ID('dbo.api_usage'))
CREATE INDEX IX_api_usage_request_id ON dbo.api_usage(request_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_api_usage_created_at' AND object_id = OBJECT_ID('dbo.api_usage'))
CREATE INDEX IX_api_usage_created_at ON dbo.api_usage(created_at DESC);
GO

-- Indexes for Model Pricing
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_model_pricing_model' AND object_id = OBJECT_ID('dbo.model_pricing'))
CREATE INDEX IX_model_pricing_model ON dbo.model_pricing(model, is_active);
GO

-- Indexes for Audit Logs
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_audit_logs_user_id' AND object_id = OBJECT_ID('dbo.audit_logs'))
CREATE INDEX IX_audit_logs_user_id ON dbo.audit_logs(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_audit_logs_created_at' AND object_id = OBJECT_ID('dbo.audit_logs'))
CREATE INDEX IX_audit_logs_created_at ON dbo.audit_logs(created_at DESC);
GO
