# Claude AI Enterprise Platform & Real-Time Usage Monitor

> **AI File Processing + AI Toolkit + Prompt Optimization + API Usage & Cost Monitoring Platform**
> Integrated with Anthropic Claude API and Microsoft SQL Server.

---

## 1. Project Overview

The **Claude AI Enterprise Platform** is a complete, production-grade web application combining real-time Claude API processing, an AI toolkit spanning 6 operational domains (Text AI, Document AI, Developer AI, Professional AI, Education AI, Custom AI), modular file ingestion (TXT, PDF, DOCX, CSV, JSON, Markdown), three-mode prompt optimization, granular token tracking, dynamic cost calculation, and a configurable **$5.00 Application Safety Budget**.

The platform is designed to provide full financial observability and task management for teams utilizing Anthropic's Claude models. It records every API call into a centralized Microsoft SQL Server database, generates structured JSON and formatted multi-sheet Excel reports (`.xlsx`), and enforces strict user/admin role isolation.

---

## 2. Key Features

- **Real Claude AI Integration**: Built with `@anthropic-ai/sdk`, executing real prompts and documents against configured Claude models (`claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`).
- **AI Toolkit (6 Domains / 45+ Capabilities)**:
  - **Text AI**: Chat, Text Generation, Summarization, Rewriting, Grammar, Translation, Analysis, Extraction, Classification, Sentiment, Q&A, Structured Output, JSON Generation, Transformation.
  - **Document AI**: Document Summarization, Document Q&A, Analysis, Information Extraction, Document Comparison.
  - **Developer AI**: Code Explanation, Code Generation, Code Review, Bug Analysis, Code Optimization, SQL Generation, SQL Explanation, Documentation Generation.
  - **Professional AI**: Resume Analysis, Resume Improvement, Cover Letter, Email Generation, Report Generation, Meeting Summary, Job Description Analysis.
  - **Education AI**: Topic Explanation, Study Notes, Question Generation, MCQ Generation, Flashcards, Exam Preparation, Q&A from Material.
  - **Custom AI**: Fully customized user prompts and system instructions.
- **Prompt Optimization Engine**:
  - **Standard**: Verbatim preservation of user intent with clean normalization.
  - **Optimized**: Systemic prompt restructuring with explicit roles, context hierarchy, and output format constraints.
  - **Maximum Efficiency**: Eliminates conversational filler, redundant instructions, and preamble to reduce prompt token footprint.
  - Interactive Diff viewer displaying Original vs. Optimized prompt, changes summary, and token difference before execution.
- **Document & File Processing**:
  - Drag-and-drop file upload for **TXT, PDF, DOCX, CSV, JSON, MD**.
  - Text extraction powered by `pdf-parse` and `mammoth`.
  - Line-ending normalization and duplicate paragraph removal.
- **$5.00 Application Safety Budget**:
  - Local safety spending limit configured via `AI_BUDGET_USD=5.00` and SQL Server `budget_settings`.
  - Pre-flight request cost estimation with warnings and optional **Hard Budget Stop**.
  - Visual budget meter and threshold alerts (50%, 75%, 80%, 90%, 100%).
  - **Crucial Distinction**: The $5.00 value is an application safety limit, not a direct query of your private Anthropic billing balance.
- **Dynamic Database Cost Engine**:
  - Model pricing stored in `dbo.model_pricing` (input/output per million, cache read/write).
  - Exact cost calculated per request and tracked cumulatively.
- **Observability & Analytics**:
  - Real-time KPI metrics cards.
  - Interactive Chart.js graphs: Cost over time, input vs. output tokens, model breakdown, task breakdown, executed AI features.
  - Per-query inspection modal with exact input/output tokens and latency.
- **Export Center**:
  - Multi-sheet Excel workbook (`complete_ai_report.xlsx`) containing 10 formatted sheets: *Summary, Tasks, API Requests, Prompts, Token Usage, Costs, Files, AI Features, Models, Errors*.
  - JSON exports for single results, usage history, and complete system dumps.
  - Instant result downloads as TXT, Markdown, JSON, or Excel.
- **Security & User Roles**:
  - Role-Based Access Control (**ADMIN** vs. **USER**).
  - Passwords hashed using `bcryptjs` (salt rounds: 10).
  - Stateless authentication via JSON Web Tokens (JWT).
  - Parameterized SQL queries preventing SQL injection.
  - API keys stored securely on the backend only; never exposed to frontend or stored in client logs.

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                 Modern Frontend (HTML5/CSS3/Vanilla JS)     │
│  - Dashboard & Charts (Chart.js)                            │
│  - AI Processing Studio (Toolkit, File Dropzone, Diff View) │
│  - History Tables (Usage, Prompts, Tasks, Files, Results)   │
│  - Export Center & Admin Settings                           │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / REST API / JWT
┌──────────────────────────────▼──────────────────────────────┐
│                    Node.js + Express Backend                │
│  ├── Routes: /api/auth, /tasks, /files, /prompts, /usage,   │
│  │           /budget, /results, /exports, /system           │
│  ├── Middleware: JWT Auth, Role RBAC, RateLimit, Helmet     │
│  └── Services:                                              │
│       ├── ai.service.js (Anthropic SDK Integration)         │
│       ├── promptOptimizer.service.js                        │
│       ├── fileProcessor.service.js (pdf-parse, mammoth)     │
│       ├── token.service.js & cost.service.js                │
│       ├── budget.service.js ($5 Safety Budget)              │
│       ├── usage.service.js (Analytics & Single Truth)       │
│       └── export.service.js (ExcelJS 10-Sheet Workbook)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│  Microsoft SQL Server 2022   │ │     Anthropic Claude API     │
│  Database: ClaudeAI_DB       │ │  - claude-3-7-sonnet         │
│  - users, tasks, files       │ │  - claude-3-5-sonnet         │
│  - prompts, api_requests     │ │  - claude-3-5-haiku          │
│  - api_usage, model_pricing  │ │  - claude-3-opus             │
│  - ai_features, results      │ └──────────────────────────────┘
│  - budget_settings, audit    │
└──────────────────────────────┘
```

---

## 4. Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism design tokens), Vanilla JavaScript (ES6+), Chart.js 4.4.
- **Backend**: Node.js v20+, Express.js 4.21, `@anthropic-ai/sdk`, `exceljs`, `pdf-parse`, `mammoth`, `multer`, `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit`.
- **Database**: MongoDB Atlas Cluster (pure native Mongoose ODM, cloud multi-region replica set, zero C++ native compile dependencies).
- **CLI Companion**: Python 3.10+ (`monitor.py`, `anthropic`, `python-dotenv`).

---

## 5. Installation & Setup

### Prerequisites
- Node.js (v18.0.0 or higher)
- MongoDB Atlas Connection String (`MONGODB_URI`)
- An Anthropic Claude API Key

### Step 1: Install Dependencies
Navigate into the `claude-usage-monitor` directory:
```bash
cd "c:\Users\ashik\OneDrive\Apps\Desktop\Claude AI\claude-usage-monitor"
npm install
```

### Step 2: Database Initialization (SQL Server)
Ensure SQL Server is running, then execute the schema and seed scripts:
```powershell
sqlcmd -S "localhost\SQLEXPRESS" -E -Q "IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'ClaudeAI_DB') CREATE DATABASE ClaudeAI_DB;"
sqlcmd -S "localhost\SQLEXPRESS" -E -d "ClaudeAI_DB" -i "database\schema.sql"
sqlcmd -S "localhost\SQLEXPRESS" -E -d "ClaudeAI_DB" -i "database\indexes.sql"
sqlcmd -S "localhost\SQLEXPRESS" -E -d "ClaudeAI_DB" -i "database\seed.sql"
```

Initialize default bcrypt credentials:
```bash
npm run db:init
```

### Step 3: Configure Environment Variables
Edit `.env`:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=super_secret_jwt_key_claude_ai_platform_antigravity_2026

# Anthropic Claude API Configuration
ANTHROPIC_API_KEY=your_actual_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-7-sonnet-20250219

# Application Safety Budget ($5.00 limit)
AI_BUDGET_USD=5.00

# SQL Server Configuration
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=ClaudeAI_DB
DB_DRIVER=ODBC Driver 17 for SQL Server
DB_TRUSTED_CONNECTION=yes
```

---

## 6. Running the Application

### Start Backend Dev Server
```bash
npm start
```
The server will start at `http://localhost:3000`.

### Open the Application
Navigate in your browser to:
```text
http://localhost:3000
```
This automatically directs to the login portal.

### Default Credentials
| Account | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@claude.ai` | `AdminPassword123!` | `ADMIN` (Full System Access) |
| **Demo User** | `user@claude.ai` | `UserPassword123!` | `USER` (Private Workspace) |

*(Quick-login buttons on `login.html` auto-fill these credentials.)*

---

## 7. Running the CLI Monitor Companion

You can also run the terminal monitor directly:
```bash
python monitor.py
```
This sends prompts in real time to Claude, tracks output tokens and request expenditure, and stops automatically if your configured $5.00 budget limit is exhausted.

---

## 8. Automated Verification Test Suite

The platform includes an automated end-to-end verification test suite covering 48 assertions across all system components:
```bash
npm test
```
Validates:
1. SQL Server database tables & foreign keys
2. Bcrypt password hashing & JWT authentication
3. Token estimation & real token parsing
4. Cost calculation using dynamic database pricing
5. $5.00 budget safety protection & hard stops
6. File text cleaning & deduplication
7. Three-mode prompt optimization
8. File validation & security limits
9. Multi-sheet Excel report generation (10 sheets)

---

## 9. Budget & Cost Observability Details

### Provider Usage vs. Application Budget
- **Provider Usage**: The actual input, output, and cache token metrics returned by Anthropic's API in `response.usage`.
- **Calculated Cost**: The expenditure derived from multiplying tokens by the rates in `dbo.model_pricing`.
- **Application Safety Budget**: A configurable threshold (default: `$5.00 USD`) managed within this platform to prevent unintended expenditure during testing.

### Budget Warning Thresholds
- **Safe**: Current spending is below the warning threshold.
- **Near Limit**: Current spending reaches 75% or 80% of budget.
- **Budget Exhausted**: Current spending reaches $5.00.
- **Hard Budget Protection**: If enabled, requests that would push cumulative expenditure past the safety budget are immediately rejected prior to sending the API call.

---

## 10. Security Architecture

1. **API Key Isolation**: `ANTHROPIC_API_KEY` is loaded exclusively in backend Node.js memory. It is never passed to frontend scripts, never stored in the database, and never printed in server logs.
2. **NoSQL Injection Defense & Validation**: All database operations use strictly-typed Mongoose models with validation schemas and sanitization.
3. **File Ingestion Protection**: Files are checked for whitelisted extensions (`.txt`, `.pdf`, `.docx`, `.csv`, `.json`, `.md`), restricted to 15MB, sanitized against path traversal (`../`), and stored with randomized suffixes.
4. **Rate Limiting & Headers**: Protected by `express-rate-limit` (300 req / 15 min) and `helmet` HTTP security headers.
5. **Data Isolation**: Standard users can only view and export their own tasks, files, prompts, and usage logs. Administrators have full system monitoring privileges.

---

## 11. Troubleshooting

- **MongoDB Atlas Connection Failure**: Verify `MONGODB_URI` in `.env` or in Render Environment settings. Ensure network access IP whitelist in Atlas includes `0.0.0.0/0` (Allow access from anywhere).
- **Anthropic API Key Missing**: Ensure `ANTHROPIC_API_KEY` in `.env` contains your key starting with `sk-ant-`. If missing, the studio will display a clear warning.

---

© 2026 Claude AI Platform. Built for Production AI Observability.
