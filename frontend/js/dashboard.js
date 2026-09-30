/**
 * Claude AI Platform - Executive Dashboard Controller
 * Multi-tab Sub-Navigation:
 * 1. Analytics & Trends
 * 2. Request History
 * 3. Usage by User
 * 4. Usage by Feature
 * 5. File Processing ( <count> )
 * 6. Download Tracking
 */

let currentRange = '7days';
let historyCurrentPage = 1;
const HISTORY_LIMIT = 15;
let filesCurrentPage = 1;
const FILES_LIMIT = 10;
let cachedFeatures = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.pathname.endsWith('dashboard.html') || window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
    initDashboard();
  }
});

async function initDashboard() {
  setupSubNavTabs();
  setupFilterTabs();
  setupHistoryFilters();
  setupFeaturesFilters();
  setupModals();
  setupExportButtons();

  // Load primary analytics & file count initially
  await Promise.all([
    loadDashboardData(),
    loadFileCountBadge()
  ]);

  // Header Refresh Button
  const refreshBtn = document.getElementById('btn-dashboard-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.style.pointerEvents = 'none';
      refreshBtn.style.opacity = '0.7';
      const activeTab = document.querySelector('.sub-nav-tab.active')?.dataset?.tab || 'analytics';
      await Promise.all([
        loadDashboardData(true),
        loadFileCountBadge()
      ]);
      if (activeTab === 'history') await loadHistoryRequests();
      if (activeTab === 'users') await loadUsersUsage();
      if (activeTab === 'features') await loadFeaturesUsage();
      if (activeTab === 'files') await loadFilesList();
      if (activeTab === 'downloads') await loadDownloadsData();
      showToast('Dashboard metrics refreshed from SQL Server', 'success');
      setTimeout(() => {
        refreshBtn.style.pointerEvents = '';
        refreshBtn.style.opacity = '';
      }, 500);
    });
  }

  // Handle URL hash routing if present
  handleHashNavigation();

  // Real-Time Polling every 15 seconds
  setInterval(() => {
    const activeTab = document.querySelector('.sub-nav-tab.active')?.dataset?.tab || 'analytics';
    if (activeTab === 'analytics') {
      loadDashboardData(false);
    }
    loadFileCountBadge();
    loadSystemStatusBadge();
  }, 15000);
  loadSystemStatusBadge();
}

async function loadSystemStatusBadge() {
  try {
    const res = await fetch('/api/system/status');
    const data = await res.json();

    // 1. Status Cluster Pills
    const claudePill = document.getElementById('pill-claude-status');
    const sqlPill = document.getElementById('pill-sql-status');
    const mongoPill = document.getElementById('pill-mongo-status');

    if (claudePill && data.success) {
      const modelShort = (data.defaultModel || 'claude-sonnet-4-6').replace('claude-', '');
      if (data.apiKeyConfigured) {
        claudePill.className = 'status-pill status-pill-live';
        claudePill.innerHTML = `<span class="status-beacon"></span><span class="pill-label">Claude ${modelShort} Live</span>`;
      } else {
        claudePill.className = 'status-pill status-pill-warn';
        claudePill.innerHTML = `<span class="status-beacon warn"></span><span class="pill-label">API Key Needed</span>`;
      }
    }

    if (sqlPill && data.success) {
      if (data.databaseConnected) {
        sqlPill.className = 'status-pill status-pill-db';
        sqlPill.innerHTML = `<span class="db-icon">🗄️</span><span class="pill-label">MS SQL Connected</span>`;
      }
    }

    if (mongoPill && data.success) {
      if (data.mongoConnected) {
        mongoPill.className = 'status-pill status-pill-atlas';
        mongoPill.innerHTML = `<span class="db-icon">🍃</span><span class="pill-label">Atlas Synced</span>`;
      } else {
        mongoPill.className = 'status-pill status-pill-warn';
        mongoPill.innerHTML = `<span class="db-icon">🍃</span><span class="pill-label" title="Add IP 157.51.59.186 to Atlas Whitelist">Atlas Standby</span>`;
      }
    }

    // 2. Legacy status pill fallback
    const pill = document.querySelector('.api-status-pill');
    if (pill && data.success) {
      if (data.mongoConnected) {
        pill.innerHTML = `<span class="status-dot" style="background:#10b981;box-shadow:0 0 10px #10b981;"></span><span>Claude Live • MS SQL & Atlas Synced</span>`;
      } else {
        pill.innerHTML = `<span class="status-dot" style="background:#00d2ff;box-shadow:0 0 10px #00d2ff;"></span><span>Claude Live • MS SQL Connected</span>`;
      }
    }
  } catch (e) {
    // Ignore status load error
  }
}

// -----------------------------------------------------------------------------
// Sub-Navigation Tabs Controller
// -----------------------------------------------------------------------------
function setupSubNavTabs() {
  const tabs = document.querySelectorAll('.sub-nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchSubTab(target);
    });
  });

  window.addEventListener('hashchange', () => {
    handleHashNavigation();
  });
}

function handleHashNavigation() {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  const validTabs = ['analytics', 'history', 'users', 'features', 'files', 'downloads'];
  if (validTabs.includes(hash)) {
    switchSubTab(hash, false);
  }
}

function switchSubTab(targetTab, updateHash = true) {
  const tabs = document.querySelectorAll('.sub-nav-tab');
  const panels = document.querySelectorAll('.tab-content-panel');

  tabs.forEach(t => {
    if (t.dataset.tab === targetTab) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  panels.forEach(p => {
    if (p.id === `panel-${targetTab}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  if (updateHash) {
    history.replaceState(null, null, `#${targetTab}`);
  }

  // Lazy-load data for the activated tab
  if (targetTab === 'analytics') {
    loadDashboardData(false);
  } else if (targetTab === 'history') {
    loadHistoryRequests();
  } else if (targetTab === 'users') {
    loadUsersUsage();
  } else if (targetTab === 'features') {
    loadFeaturesUsage();
  } else if (targetTab === 'files') {
    loadFilesList();
  } else if (targetTab === 'downloads') {
    loadDownloadsData();
  }
}

// -----------------------------------------------------------------------------
// TAB 1: Analytics & Trends
// -----------------------------------------------------------------------------
function setupFilterTabs() {
  const filterBtns = document.querySelectorAll('.filter-tab-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range || '7days';
      await loadDashboardData();
    });
  });
}

async function loadDashboardData(showLoading = true) {
  try {
    // 1. Fetch Summary Totals (KPIs)
    const summaryRes = await api.getUsageSummary();
    const data = summaryRes.data;

    // Populate KPI Cards
    setElText('kpi-total-tasks', Number(data.totalTasks).toLocaleString());
    setElText('kpi-total-requests', Number(data.totalRequests).toLocaleString());
    setElText('kpi-input-tokens', Number(data.inputTokens).toLocaleString());
    setElText('kpi-output-tokens', Number(data.outputTokens).toLocaleString());
    setElText('kpi-total-tokens', Number(data.totalTokens).toLocaleString());
    setElText('kpi-total-cost', `$${Number(data.totalCost).toFixed(6)}`);
    setElText('kpi-avg-cost', `$${Number(data.avgCostPerRequest).toFixed(6)}`);

    // Populate $5 Budget Banner
    setElText('budget-banner-total', `$${Number(data.applicationBudget).toFixed(2)}`);
    setElText('budget-banner-spent', `$${Number(data.usedBudget).toFixed(4)}`);
    setElText('budget-banner-remaining', `$${Number(data.remainingBudget).toFixed(4)}`);
    setElText('budget-banner-pct', `${Number(data.usagePercentage).toFixed(1)}%`);

    const fillBar = document.getElementById('budget-banner-fill');
    if (fillBar) {
      fillBar.style.width = `${Math.min(100, data.usagePercentage)}%`;
      if (data.usagePercentage >= 90) fillBar.style.background = 'var(--accent-rose)';
      else if (data.usagePercentage >= 75) fillBar.style.background = 'var(--accent-amber)';
      else fillBar.style.background = 'var(--accent-gradient)';
    }

    const badgeStatus = document.getElementById('budget-status-badge');
    if (badgeStatus) {
      if (data.budgetStatus === 'BUDGET_EXHAUSTED') {
        badgeStatus.className = 'badge badge-danger';
        badgeStatus.textContent = 'Budget Exhausted';
      } else if (data.budgetStatus === 'NEAR_LIMIT') {
        badgeStatus.className = 'badge badge-warning';
        badgeStatus.textContent = 'Near Warning Threshold';
      } else {
        badgeStatus.className = 'badge badge-success';
        badgeStatus.textContent = 'Safe to Process';
      }
    }

    // 2. Fetch Chart Analytics for currentRange
    const chartRes = await api.getChartAnalytics(currentRange);
    initCharts(chartRes.data);

  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    if (showLoading) {
      showToast('Could not load dashboard analytics: ' + err.message, 'error');
    }
  }
}

// -----------------------------------------------------------------------------
// TAB 2: Request History
// -----------------------------------------------------------------------------
function setupHistoryFilters() {
  const searchInput = document.getElementById('dashboard-history-search');
  const dateSelect = document.getElementById('dashboard-history-date');
  const modelSelect = document.getElementById('dashboard-history-model');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      historyCurrentPage = 1;
      loadHistoryRequests();
    }, 400));
  }

  if (dateSelect) {
    dateSelect.addEventListener('change', () => {
      historyCurrentPage = 1;
      loadHistoryRequests();
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      historyCurrentPage = 1;
      loadHistoryRequests();
    });
  }
}

async function loadHistoryRequests() {
  const tbody = document.getElementById('dashboard-history-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px;">Loading requests...</td></tr>';

  const search = document.getElementById('dashboard-history-search')?.value || '';
  const dateRange = document.getElementById('dashboard-history-date')?.value || 'all';
  const model = document.getElementById('dashboard-history-model')?.value || '';

  try {
    const res = await api.getUsageRequests({
      search,
      dateRange,
      model,
      page: historyCurrentPage,
      limit: HISTORY_LIMIT
    });

    const requests = res.data;
    const pagination = res.pagination;

    if (!requests || requests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--text-dim);">No API requests found matching criteria.</td></tr>';
      renderHistoryPagination(pagination);
      return;
    }

    tbody.innerHTML = '';
    requests.forEach(r => {
      const tr = document.createElement('tr');
      const dateStr = new Date(r.created_at).toLocaleString();
      const statusBadge = r.status === 'SUCCESS' 
        ? '<span class="badge badge-success">Success</span>' 
        : '<span class="badge badge-danger">Failed</span>';

      tr.innerHTML = `
        <td class="mono-cell font-bold" style="color: var(--accent-primary);">#${r.request_id}</td>
        <td>${dateStr}</td>
        <td><span class="badge badge-indigo">${escapeHtml(r.task_type || 'Custom AI')}</span></td>
        <td class="mono-cell" style="font-size: 12px;">${r.model}</td>
        <td class="mono-cell">${Number(r.input_tokens).toLocaleString()}</td>
        <td class="mono-cell">${Number(r.output_tokens).toLocaleString()}</td>
        <td class="mono-cell font-bold">${Number(r.total_tokens).toLocaleString()}</td>
        <td class="mono-cell" style="color: #34d399; font-weight: 600;">$${Number(r.request_cost).toFixed(6)}</td>
        <td>${statusBadge}</td>
      `;

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openRequestDetailsModal(r.request_id));
      tbody.appendChild(tr);
    });

    renderHistoryPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function renderHistoryPagination(pagination) {
  const container = document.getElementById('dashboard-history-pagination');
  if (!container || !pagination) return;

  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) {
    container.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">${total} total requests</span>`;
    return;
  }

  container.innerHTML = `
    <span style="font-size: 12px; color: var(--text-muted); margin-right: 12px;">Page ${page} of ${totalPages} (${total} items)</span>
    <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} id="hist-page-prev">Prev</button>
    <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} id="hist-page-next">Next</button>
  `;

  document.getElementById('hist-page-prev')?.addEventListener('click', () => {
    if (historyCurrentPage > 1) {
      historyCurrentPage--;
      loadHistoryRequests();
    }
  });

  document.getElementById('hist-page-next')?.addEventListener('click', () => {
    if (historyCurrentPage < totalPages) {
      historyCurrentPage++;
      loadHistoryRequests();
    }
  });
}

// -----------------------------------------------------------------------------
// TAB 3: Usage by User
// -----------------------------------------------------------------------------
async function loadUsersUsage() {
  const tbody = document.getElementById('dashboard-users-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px;">Loading user breakdown...</td></tr>';

  try {
    const res = await api.getUsageByUser();
    const users = res.data;

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px; color: var(--text-dim);">No user accounts recorded.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      const lastActive = u.last_active ? new Date(u.last_active).toLocaleString() : 'Never';
      const roleBadge = u.role === 'ADMIN' 
        ? '<span class="badge badge-indigo">ADMIN</span>' 
        : '<span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1;">USER</span>';

      tr.innerHTML = `
        <td class="mono-cell">#${u.user_id}</td>
        <td class="font-bold">${escapeHtml(u.name)}</td>
        <td style="color: var(--text-muted);">${escapeHtml(u.email)}</td>
        <td>${roleBadge}</td>
        <td class="mono-cell font-bold">${Number(u.total_requests).toLocaleString()}</td>
        <td class="mono-cell">${Number(u.total_input_tokens).toLocaleString()}</td>
        <td class="mono-cell">${Number(u.total_output_tokens).toLocaleString()}</td>
        <td class="mono-cell font-bold" style="color: #818cf8;">${Number(u.total_tokens).toLocaleString()}</td>
        <td class="mono-cell font-bold" style="color: #34d399;">$${Number(u.total_cost).toFixed(6)}</td>
        <td style="font-size: 12px; color: var(--text-dim);">${lastActive}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 24px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// TAB 4: Usage by Feature
// -----------------------------------------------------------------------------
function setupFeaturesFilters() {
  const filter = document.getElementById('dashboard-features-filter');
  if (filter) {
    filter.addEventListener('change', () => {
      renderFeaturesTable(filter.value);
    });
  }
}

async function loadFeaturesUsage() {
  const tbody = document.getElementById('dashboard-features-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading features usage...</td></tr>';

  try {
    const res = await api.getUsageByFeature();
    cachedFeatures = res.data || [];
    renderFeaturesTable(document.getElementById('dashboard-features-filter')?.value || 'all');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function renderFeaturesTable(categoryFilter = 'all') {
  const tbody = document.getElementById('dashboard-features-tbody');
  if (!tbody) return;

  let list = cachedFeatures;
  if (categoryFilter !== 'all') {
    list = list.filter(f => f.category === categoryFilter);
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No feature executions recorded in this category.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  list.forEach(f => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono-cell" style="font-size: 12px; color: var(--accent-cyan);">${f.feature_id}</td>
      <td class="font-bold">${escapeHtml(f.feature_name)}</td>
      <td><span class="badge badge-indigo">${escapeHtml(f.category)}</span></td>
      <td style="font-size: 13px; color: var(--text-muted); max-width: 300px;">${escapeHtml(f.description || '')}</td>
      <td class="mono-cell font-bold"><span class="badge badge-success">${Number(f.execution_count).toLocaleString()}</span></td>
      <td class="mono-cell">${Number(f.total_tokens).toLocaleString()}</td>
      <td class="mono-cell" style="color: #34d399; font-weight: 600;">$${Number(f.total_cost).toFixed(6)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -----------------------------------------------------------------------------
// TAB 5: File Processing & Counter Badge
// -----------------------------------------------------------------------------
async function loadFileCountBadge() {
  try {
    const res = await api.getFiles({ limit: 1 });
    const total = res.pagination?.total || 0;
    const badge = document.getElementById('file-tab-counter');
    if (badge) {
      badge.textContent = total;
    }
  } catch (err) {
    console.error('Failed to load file count badge:', err);
  }
}

async function loadFilesList() {
  const tbody = document.getElementById('dashboard-files-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading processed files...</td></tr>';

  try {
    const res = await api.getFiles({
      page: filesCurrentPage,
      limit: FILES_LIMIT
    });

    const files = res.data;
    const pagination = res.pagination;

    // Update count badge
    if (pagination) {
      setElText('file-tab-counter', pagination.total);
    }

    if (!files || files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No files uploaded yet. Click "+ Upload & Process File" to get started.</td></tr>';
      renderFilesPagination(pagination);
      return;
    }

    tbody.innerHTML = '';
    files.forEach(f => {
      const tr = document.createElement('tr');
      const dateStr = new Date(f.created_at).toLocaleString();
      const formatUpper = (f.file_type || '').toUpperCase();
      const sizeStr = formatFileSize(f.file_size);

      tr.innerHTML = `
        <td class="mono-cell">#${f.file_id}</td>
        <td class="font-bold">
          <span style="margin-right: 6px;">📄</span>${escapeHtml(f.file_name)}
        </td>
        <td><span class="badge badge-indigo">${formatUpper}</span></td>
        <td class="mono-cell" style="color: var(--text-muted);">${sizeStr}</td>
        <td style="font-size: 12px; color: var(--text-dim);">${dateStr}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-preview-file" data-id="${f.file_id}">
            <span>Inspect Extracted Text</span>
          </button>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <a href="processor.html?fileId=${f.file_id}" class="btn btn-primary btn-sm" title="Analyze with Claude">
              <span>Process</span>
            </a>
            <a href="/api/files/${f.file_id}/download?token=${encodeURIComponent(api.getToken())}" class="btn btn-secondary btn-sm" title="Download original">
              <span>Download</span>
            </a>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach preview event handlers
    document.querySelectorAll('.btn-preview-file').forEach(btn => {
      btn.addEventListener('click', () => {
        openFilePreviewModal(btn.dataset.id);
      });
    });

    renderFilesPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function renderFilesPagination(pagination) {
  const container = document.getElementById('dashboard-files-pagination');
  if (!container || !pagination) return;

  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) {
    container.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">${total} total files</span>`;
    return;
  }

  container.innerHTML = `
    <span style="font-size: 12px; color: var(--text-muted); margin-right: 12px;">Page ${page} of ${totalPages} (${total} files)</span>
    <button class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''} id="files-page-prev">Prev</button>
    <button class="btn btn-secondary btn-sm" ${page >= totalPages ? 'disabled' : ''} id="files-page-next">Next</button>
  `;

  document.getElementById('files-page-prev')?.addEventListener('click', () => {
    if (filesCurrentPage > 1) {
      filesCurrentPage--;
      loadFilesList();
    }
  });

  document.getElementById('files-page-next')?.addEventListener('click', () => {
    if (filesCurrentPage < totalPages) {
      filesCurrentPage++;
      loadFilesList();
    }
  });
}

async function openFilePreviewModal(fileId) {
  const modal = document.getElementById('file-preview-modal');
  const nameEl = document.getElementById('preview-file-name');
  const contentEl = document.getElementById('preview-file-content');
  if (!modal || !contentEl) return;

  nameEl.textContent = 'Loading file...';
  contentEl.textContent = 'Fetching extracted text from database...';
  modal.classList.add('active');

  try {
    const res = await api.getFileById(fileId);
    const f = res.data;
    nameEl.textContent = `Extracted Text Preview: ${f.file_name} (${(f.file_type || '').toUpperCase()})`;
    contentEl.textContent = f.extracted_text || '(No extracted text recorded)';
  } catch (err) {
    contentEl.textContent = 'Failed to load file text: ' + err.message;
  }
}

// -----------------------------------------------------------------------------
// TAB 6: Download Tracking
// -----------------------------------------------------------------------------
function setupExportButtons() {
  const token = api.getToken();
  if (!token) return;

  const masterBtn = document.getElementById('btn-export-master-dash');
  if (masterBtn) {
    masterBtn.href = `/api/exports/master/excel?token=${encodeURIComponent(token)}`;
  }

  const histXlsx = document.getElementById('btn-export-history-xlsx');
  if (histXlsx) {
    histXlsx.href = `/api/exports/usage/excel?token=${encodeURIComponent(token)}`;
  }

  const dlUsageXlsx = document.getElementById('btn-dl-usage-xlsx');
  if (dlUsageXlsx) {
    dlUsageXlsx.href = `/api/exports/usage/excel?token=${encodeURIComponent(token)}`;
  }

  const dlUsageJson = document.getElementById('btn-dl-usage-json');
  if (dlUsageJson) {
    dlUsageJson.href = `/api/exports/usage/json?token=${encodeURIComponent(token)}`;
  }

  const dlPromptsXlsx = document.getElementById('btn-dl-prompts-xlsx');
  if (dlPromptsXlsx) {
    dlPromptsXlsx.href = `/api/exports/report/excel?token=${encodeURIComponent(token)}`;
  }

  const dlPromptsJson = document.getElementById('btn-dl-prompts-json');
  if (dlPromptsJson) {
    dlPromptsJson.href = `/api/exports/report/json?token=${encodeURIComponent(token)}`;
  }

  const dlAuditJson = document.getElementById('btn-dl-audit-json');
  if (dlAuditJson) {
    dlAuditJson.href = `/api/exports/report/json?token=${encodeURIComponent(token)}`;
  }
}

async function loadDownloadsData() {
  setupExportButtons();

  const tbody = document.getElementById('dashboard-downloads-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading generated results...</td></tr>';

  try {
    const res = await api.getTasks({ limit: 15 });
    const tasks = res.data;

    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-dim);">No AI results generated yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    const token = api.getToken();

    tasks.forEach(t => {
      const tr = document.createElement('tr');
      const dateStr = new Date(t.created_at).toLocaleString();

      tr.innerHTML = `
        <td class="mono-cell font-bold">#${t.task_id}</td>
        <td><span class="badge badge-indigo">${escapeHtml(t.task_type)}</span></td>
        <td class="mono-cell" style="font-size: 12px;">${t.model || 'claude-sonnet-4-6'}</td>
        <td style="font-size: 12px; color: var(--text-dim);">${dateStr}</td>
        <td class="mono-cell font-bold">${Number(t.total_tokens || 0).toLocaleString()}</td>
        <td class="mono-cell" style="color: #34d399; font-weight: 600;">$${Number(t.request_cost || 0).toFixed(6)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <a href="/api/results/${t.task_id}/download?format=txt&token=${encodeURIComponent(token)}" class="btn btn-secondary btn-sm" title="Plain text format">
              <span>TXT</span>
            </a>
            <a href="/api/results/${t.task_id}/download?format=md&token=${encodeURIComponent(token)}" class="btn btn-secondary btn-sm" title="Markdown format">
              <span>MD</span>
            </a>
            <a href="/api/results/${t.task_id}/download?format=json&token=${encodeURIComponent(token)}" class="btn btn-secondary btn-sm" title="JSON format">
              <span>JSON</span>
            </a>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// Request Details Modal
// -----------------------------------------------------------------------------
async function openRequestDetailsModal(requestId) {
  const modal = document.getElementById('request-modal');
  if (!modal) return;

  setElText('modal-req-id', `#${requestId}`);
  setElText('modal-user-name', 'Loading...');
  setElText('modal-date', 'Loading...');
  setElText('modal-task-type', '...');
  setElText('modal-model', '...');
  setElText('modal-input-tokens', '0');
  setElText('modal-output-tokens', '0');
  setElText('modal-total-tokens', '0');
  setElText('modal-req-cost', '$0.00');
  setElText('modal-latency', '0ms');
  setElText('modal-orig-prompt', 'Loading...');
  setElText('modal-opt-prompt', 'Loading...');
  setElText('modal-result', 'Loading...');
  document.getElementById('modal-features-list').innerHTML = '';

  modal.classList.add('active');

  try {
    const res = await api.getRequestDetails(requestId);
    const d = res.data;

    setElText('modal-user-name', d.user_name || 'Anonymous User');
    setElText('modal-date', new Date(d.created_at).toUTCString());
    setElText('modal-task-type', d.task_type || 'Custom');
    setElText('modal-model', d.model);
    setElText('modal-input-tokens', Number(d.input_tokens).toLocaleString());
    setElText('modal-output-tokens', Number(d.output_tokens).toLocaleString());
    setElText('modal-total-tokens', Number(d.total_tokens).toLocaleString());
    setElText('modal-req-cost', `$${Number(d.request_cost).toFixed(6)}`);
    setElText('modal-latency', `${d.processing_time_ms}ms`);

    setElText('modal-orig-prompt', d.original_prompt || '(None)');
    setElText('modal-opt-prompt', d.optimized_prompt || '(No prompt optimization applied)');
    setElText('modal-result', d.result_text || '(No result recorded)');

    const featContainer = document.getElementById('modal-features-list');
    if (d.features && d.features.length > 0) {
      featContainer.innerHTML = d.features.map(f => `
        <span class="badge badge-indigo" title="${escapeHtml(f.description || '')}">${escapeHtml(f.feature_name)}</span>
      `).join('');
    } else {
      featContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-dim);">(No individual AI features tracked)</span>';
    }

  } catch (err) {
    showToast('Failed to load request details: ' + err.message, 'error');
  }
}

function setupModals() {
  // Request Modal
  const reqModal = document.getElementById('request-modal');
  const reqClose = document.getElementById('modal-close-btn');
  if (reqClose && reqModal) {
    reqClose.addEventListener('click', () => reqModal.classList.remove('active'));
    reqModal.addEventListener('click', (e) => {
      if (e.target === reqModal) reqModal.classList.remove('active');
    });
  }

  // File Modal
  const fileModal = document.getElementById('file-preview-modal');
  const fileClose = document.getElementById('file-modal-close-btn');
  if (fileClose && fileModal) {
    fileClose.addEventListener('click', () => fileModal.classList.remove('active'));
    fileModal.addEventListener('click', (e) => {
      if (e.target === fileModal) fileModal.classList.remove('active');
    });
  }

  const refreshUsersBtn = document.getElementById('btn-refresh-users');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => {
      loadUsersUsage();
    });
  }

  // Quick Copy Buttons
  setupCopyBtn('btn-copy-orig-prompt', 'modal-orig-prompt', 'Original prompt');
  setupCopyBtn('btn-copy-opt-prompt', 'modal-opt-prompt', 'Optimized prompt');
  setupCopyBtn('btn-copy-result', 'modal-result', 'Claude result');
  setupCopyBtn('btn-copy-file-text', 'preview-file-content', 'File extracted text');
}

function setupCopyBtn(btnId, targetId, label) {
  const btn = document.getElementById(btnId);
  const target = document.getElementById(targetId);
  if (btn && target) {
    btn.addEventListener('click', async () => {
      const text = target.innerText || target.textContent || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard!`, 'success');
      } catch {
        showToast('Could not copy to clipboard', 'info');
      }
    });
  }
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

