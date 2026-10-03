/**
 * Claude AI Platform - API Client
 * Centralized HTTP service managing JWT authorization, API calls, and error handling.
 */

const API_BASE = '/api';

const api = {
  // Helper to get stored auth token
  getToken() {
    return localStorage.getItem('claude_ai_token');
  },

  // Helper to get stored user profile
  getUser() {
    try {
      const u = localStorage.getItem('claude_ai_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  // Active Claude API Key Management
  getActiveApiKeyId() {
    return localStorage.getItem('claude_active_key_id') || '';
  },

  setActiveApiKeyId(keyId) {
    if (keyId) {
      localStorage.setItem('claude_active_key_id', String(keyId));
    } else {
      localStorage.removeItem('claude_active_key_id');
    }
    window.dispatchEvent(new CustomEvent('activeKeyChanged', { detail: { keyId } }));
  },

  // Standard fetch wrapper
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = this.getToken();

    const headers = {
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const activeKeyId = this.getActiveApiKeyId();
    if (activeKeyId && !headers['X-Api-Key-Id']) {
      headers['X-Api-Key-Id'] = activeKeyId;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle session expiration
      if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem('claude_ai_token');
        localStorage.removeItem('claude_ai_user');
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = 'login.html?expired=1';
        }
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Request failed');
        }
        return data;
      }

      // Blob or file download
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  register(name, email, password, role = 'USER') {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
  },

  getMe() {
    return this.request('/auth/me');
  },

  // System & Meta
  getStatus() {
    return this.request('/system/status');
  },

  getModels() {
    return this.request('/system/models');
  },

  getFeatures() {
    return this.request('/system/features');
  },

  // Tasks & Processing
  processTask(payload) {
    return this.request('/tasks/process', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getTasks(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/tasks?${q}`);
  },

  getTaskById(id) {
    return this.request(`/tasks/${id}`);
  },

  // Prompt Optimization
  optimizePrompt(prompt, mode = 'Optimized') {
    return this.request('/prompts/optimize', {
      method: 'POST',
      body: JSON.stringify({ prompt, mode })
    });
  },

  getPrompts(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/prompts?${q}`);
  },

  getPromptById(id) {
    return this.request(`/prompts/${id}`);
  },

  // File Processing
  uploadFile(formData) {
    return this.request('/files/upload', {
      method: 'POST',
      body: formData
    });
  },

  getFiles(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/files?${q}`);
  },

  getFileById(id) {
    return this.request(`/files/${id}`);
  },

  // Usage & Dashboard
  getUsageSummary() {
    return this.request('/usage/summary');
  },

  getUsageRequests(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/usage/requests?${q}`);
  },

  getRequestDetails(id) {
    return this.request(`/usage/requests/${id}`);
  },

  getChartAnalytics(range = '7days') {
    return this.request(`/usage/charts?range=${range}`);
  },

  getUsageByUser() {
    return this.request('/usage/by-user');
  },

  getUsageByFeature() {
    return this.request('/usage/by-feature');
  },

  // Budget
  getBudget() {
    return this.request('/budget');
  },

  updateBudget(payload) {
    return this.request('/budget', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  preCheckCost(payload) {
    return this.request('/budget/pre-check', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Results & Downloads
  getResult(taskId) {
    return this.request(`/results/${taskId}`);
  },

  downloadResultUrl(taskId, format = 'txt') {
    const token = this.getToken();
    return `${API_BASE}/results/${taskId}/download?format=${format}&token=${encodeURIComponent(token)}`;
  },

  // Exports URLs
  getExportUrl(type) {
    const token = this.getToken();
    return `${API_BASE}/exports/${type}?token=${encodeURIComponent(token)}`;
  },

  // API Key Management (Dynamic Multi-Key Support)
  getKeys() {
    return this.request('/keys');
  },

  getKeyById(id) {
    return this.request(`/keys/${id}`);
  },

  createKey(payload) {
    return this.request('/keys', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  updateKey(id, payload) {
    return this.request(`/keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  deleteKey(id) {
    return this.request(`/keys/${id}`, {
      method: 'DELETE'
    });
  },

  testKey(payload = {}, id = null) {
    const ep = id ? `/keys/${id}/test` : '/keys/test';
    return this.request(ep, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};

// Global UI Toast Helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Global Active API Key Selector Initializer
async function setupActiveKeySelector(selectElementId = 'global-active-key-select') {
  try {
    const select = document.getElementById(selectElementId);
    if (!select) return;

    const res = await api.getKeys();
    const keys = res.data || [];
    if (!keys.length) return;

    let activeKeyId = api.getActiveApiKeyId();
    const defaultKey = keys.find(k => k.is_default) || keys[0];

    if (!activeKeyId || !keys.some(k => String(k.key_id) === String(activeKeyId))) {
      activeKeyId = String(defaultKey.key_id);
      localStorage.setItem('claude_active_key_id', activeKeyId);
    }

    select.innerHTML = '';
    keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.key_id;
      const defMarker = k.is_default ? ' ★' : '';
      opt.textContent = `${k.name} (${k.masked_key})${defMarker}`;
      if (String(k.key_id) === String(activeKeyId)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.onchange = (e) => {
      const selectedId = e.target.value;
      api.setActiveApiKeyId(selectedId);
      const chosen = keys.find(k => String(k.key_id) === String(selectedId));
      showToast(`Active API Key switched to: ${chosen ? chosen.name : selectedId}`, 'info');
    };
  } catch (err) {
    console.warn('Could not populate active key selector:', err);
  }
}
