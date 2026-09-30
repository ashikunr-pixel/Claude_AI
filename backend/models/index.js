const mongoose = require('mongoose');

// Counter schema for atomic auto-increment IDs
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

const SEQUENCE_CONFIG = {
  file: { modelName: 'File', field: 'file_id' },
  task: { modelName: 'Task', field: 'task_id' },
  user: { modelName: 'User', field: 'user_id' },
  prompt: { modelName: 'Prompt', field: 'prompt_id' },
  request: { modelName: 'ApiRequest', field: 'request_id' },
  usage: { modelName: 'ApiUsage', field: 'usage_id' },
  result: { modelName: 'GeneratedResult', field: 'result_id' },
  taskfeature: { modelName: 'TaskFeature', field: 'task_feature_id' },
  log: { modelName: 'AuditLog', field: 'log_id' }
};

function normalizeSeqKey(name) {
  const clean = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const prefix of Object.keys(SEQUENCE_CONFIG)) {
    if (clean.startsWith(prefix)) {
      return prefix;
    }
  }
  return clean;
}

async function getNextSequence(name) {
  const prefix = normalizeSeqKey(name);
  const cfg = SEQUENCE_CONFIG[prefix];
  const canonicalId = cfg ? cfg.field : name;

  let maxExisting = 0;
  if (cfg && mongoose.models && mongoose.models[cfg.modelName]) {
    try {
      const TargetModel = mongoose.models[cfg.modelName];
      const maxDoc = await TargetModel.findOne()
        .sort({ [cfg.field]: -1 })
        .select({ [cfg.field]: 1 })
        .lean();
      if (maxDoc && typeof maxDoc[cfg.field] === 'number') {
        maxExisting = maxDoc[cfg.field];
      }
    } catch (e) {
      // Model not yet ready or empty collection
    }
  }

  const currentCounter = await Counter.findById(canonicalId).lean();
  const currentSeq = (currentCounter && typeof currentCounter.seq === 'number') ? currentCounter.seq : 0;
  const baseline = Math.max(currentSeq, maxExisting);
  const nextSeq = baseline + 1;

  const counter = await Counter.findByIdAndUpdate(
    canonicalId,
    { $set: { seq: nextSeq } },
    { returnDocument: 'after', upsert: true }
  );

  // Sync alternative names (e.g. camelCase like 'fileId') to keep counters consistent
  if (name !== canonicalId) {
    await Counter.findByIdAndUpdate(
      name,
      { $set: { seq: counter.seq } },
      { upsert: true }
    ).catch(() => {});
  }

  return counter.seq;
}

// 1. Users Collection
const userSchema = new mongoose.Schema({
  user_id: { type: Number, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'USER'], default: 'USER', index: true },
  created_at: { type: Date, default: Date.now }
});

// 2. Tasks Collection
const taskSchema = new mongoose.Schema({
  task_id: { type: Number, unique: true, index: true },
  user_id: { type: Number, index: true },
  task_type: { type: String, required: true, index: true },
  status: { type: String, default: 'PROCESSING', index: true },
  runtime_options: { type: String, default: '{}' },
  created_at: { type: Date, default: Date.now, index: true },
  completed_at: { type: Date }
});

// 3. Files Collection
const fileSchema = new mongoose.Schema({
  file_id: { type: Number, unique: true, index: true },
  user_id: { type: Number, index: true },
  file_name: { type: String, required: true },
  file_type: { type: String, required: true },
  file_size: { type: Number, required: true },
  storage_path: { type: String, required: true },
  extracted_text: { type: String },
  created_at: { type: Date, default: Date.now, index: true }
});

// 4. Prompts Collection
const promptSchema = new mongoose.Schema({
  prompt_id: { type: Number, unique: true, index: true },
  task_id: { type: Number, index: true },
  original_prompt: { type: String, required: true },
  optimized_prompt: { type: String },
  optimization_mode: { type: String, default: 'Standard' },
  changes_summary: { type: String },
  token_difference: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

// 5. API Requests Collection
const apiRequestSchema = new mongoose.Schema({
  request_id: { type: Number, unique: true, index: true },
  task_id: { type: Number, index: true },
  user_id: { type: Number, index: true },
  provider: { type: String, default: 'anthropic' },
  model: { type: String, required: true, index: true },
  status: { type: String, default: 'SUCCESS', index: true },
  processing_time_ms: { type: Number, default: 0 },
  error_message: { type: String },
  created_at: { type: Date, default: Date.now, index: true }
});

// 6. API Usage & Costs Collection
const apiUsageSchema = new mongoose.Schema({
  usage_id: { type: Number, unique: true, index: true },
  request_id: { type: Number, index: true },
  input_tokens: { type: Number, default: 0 },
  output_tokens: { type: Number, default: 0 },
  total_tokens: { type: Number, default: 0 },
  cache_creation_tokens: { type: Number, default: 0 },
  cache_read_tokens: { type: Number, default: 0 },
  request_cost: { type: Number, default: 0.0 },
  cumulative_cost: { type: Number, default: 0.0 },
  remaining_budget: { type: Number, default: 5.0 },
  created_at: { type: Date, default: Date.now, index: true }
});

// 7. Model Pricing Collection
const modelPricingSchema = new mongoose.Schema({
  pricing_id: { type: Number, unique: true, index: true },
  provider: { type: String, default: 'anthropic' },
  model: { type: String, required: true, unique: true },
  input_price_per_million: { type: Number, required: true },
  output_price_per_million: { type: Number, required: true },
  cache_read_price: { type: Number, default: 0.3 },
  cache_write_price: { type: Number, default: 3.75 },
  is_active: { type: Boolean, default: true, index: true }
});

// 8. AI Features Collection
const aiFeatureSchema = new mongoose.Schema({
  feature_id: { type: Number, unique: true, index: true },
  feature_name: { type: String, required: true, unique: true },
  category: { type: String, required: true, index: true },
  description: { type: String }
});

// 9. Task Features Junction Collection
const taskFeatureSchema = new mongoose.Schema({
  task_feature_id: { type: Number, unique: true, index: true },
  task_id: { type: Number, index: true },
  feature_id: { type: Number, index: true }
});

// 10. Generated Results Collection
const generatedResultSchema = new mongoose.Schema({
  result_id: { type: Number, unique: true, index: true },
  task_id: { type: Number, index: true },
  result_text: { type: String, required: true },
  result_format: { type: String, default: 'markdown' },
  token_count: { type: Number, default: 0 },
  cost_usd: { type: Number, default: 0.0 },
  storage_path: { type: String },
  created_at: { type: Date, default: Date.now }
});

// 11. Budget Settings Collection
const budgetSettingSchema = new mongoose.Schema({
  setting_id: { type: Number, unique: true, default: 1 },
  budget_usd: { type: Number, default: 5.0 },
  warning_threshold: { type: Number, default: 80 },
  hard_stop_enabled: { type: Boolean, default: false },
  updated_at: { type: Date, default: Date.now }
});

// 12. Audit Logs Collection
const auditLogSchema = new mongoose.Schema({
  log_id: { type: Number, index: true },
  user_id: { type: Number, index: true },
  action: { type: String, required: true },
  resource_type: { type: String },
  resource_id: { type: Number },
  details: { type: String },
  ip_address: { type: String },
  timestamp: { type: Date, default: Date.now, index: true }
});

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);
const File = mongoose.model('File', fileSchema);
const Prompt = mongoose.model('Prompt', promptSchema);
const ApiRequest = mongoose.model('ApiRequest', apiRequestSchema);
const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);
const ModelPricing = mongoose.model('ModelPricing', modelPricingSchema);
const AiFeature = mongoose.model('AiFeature', aiFeatureSchema);
const TaskFeature = mongoose.model('TaskFeature', taskFeatureSchema);
const GeneratedResult = mongoose.model('GeneratedResult', generatedResultSchema);
const BudgetSetting = mongoose.model('BudgetSetting', budgetSettingSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = {
  Counter,
  getNextSequence,
  User,
  Task,
  File,
  Prompt,
  ApiRequest,
  ApiUsage,
  ModelPricing,
  AiFeature,
  TaskFeature,
  GeneratedResult,
  BudgetSetting,
  AuditLog
};
