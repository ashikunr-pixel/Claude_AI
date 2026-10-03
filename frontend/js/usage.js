/**
 * Claude AI Platform - Request & Usage History Controller
 */

let currentPage = 1;
const PAGE_LIMIT = 15;

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('usage.html')) {
    initUsagePage();
  }
});

async function initUsagePage() {
  await setupActiveKeySelector('global-active-key-select');
  window.addEventListener('activeKeyChanged', () => {
    currentPage = 1;
    loadUsageRequests();
  });
  setupSearchAndFilters();
  loadUsageRequests();
}

function setupSearchAndFilters() {
  const searchInput = document.getElementById('usage-search');
  const dateSelect = document.getElementById('filter-date');
  const modelSelect = document.getElementById('filter-model');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      currentPage = 1;
      loadUsageRequests();
    }, 400));
  }

  if (dateSelect) {
    dateSelect.addEventListener('change', () => {
      currentPage = 1;
      loadUsageRequests();
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      currentPage = 1;
      loadUsageRequests();
    });
  }

  // Close modal button
  const modalClose = document.getElementById('modal-close-btn');
  const modalOverlay = document.getElementById('request-modal');
  if (modalClose && modalOverlay) {
    modalClose.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });
  }
}

async function loadUsageRequests() {
  const tbody = document.getElementById('usage-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 30px;">Loading requests...</td></tr>';

  const search = document.getElementById('usage-search')?.value || '';
  const dateRange = document.getElementById('filter-date')?.value || 'all';
  const model = document.getElementById('filter-model')?.value || '';

  try {
    const res = await api.getUsageRequests({
      search,
      dateRange,
      model,
      page: currentPage,
      limit: PAGE_LIMIT
    });

    const requests = res.data;
    const pagination = res.pagination;

    if (requests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 30px; color: var(--text-dim);">No API requests found matching criteria.</td></tr>';
      renderPagination(pagination);
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
        <td class="mono-cell">#${r.request_id}</td>
        <td>${dateStr}</td>
        <td><span class="badge badge-indigo">${r.task_type || 'Custom AI'}</span></td>
        <td class="mono-cell">${r.model}</td>
        <td class="mono-cell">${Number(r.input_tokens).toLocaleString()}</td>
        <td class="mono-cell">${Number(r.output_tokens).toLocaleString()}</td>
        <td class="mono-cell font-bold">${Number(r.total_tokens).toLocaleString()}</td>
        <td class="mono-cell" style="color: #34d399;">$${Number(r.request_cost).toFixed(6)}</td>
        <td>${statusBadge}</td>
      `;

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => openRequestDetailsModal(r.request_id));
      tbody.appendChild(tr);
    });

    renderPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 30px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

async function openRequestDetailsModal(requestId) {
  const modal = document.getElementById('request-modal');
  if (!modal) return;

  try {
    const res = await api.getRequestDetails(requestId);
    const d = res.data;

    setModalText('modal-req-id', `#${d.request_id}`);
    setModalText('modal-user-name', `${d.user_name} (${d.user_email})`);
    setModalText('modal-date', new Date(d.created_at).toLocaleString());
    setModalText('modal-task-type', d.task_type || 'Custom');
    setModalText('modal-model', d.model);
    setModalText('modal-input-tokens', Number(d.input_tokens).toLocaleString());
    setModalText('modal-output-tokens', Number(d.output_tokens).toLocaleString());
    setModalText('modal-total-tokens', Number(d.total_tokens).toLocaleString());
    setModalText('modal-req-cost', `$${Number(d.request_cost).toFixed(6)}`);
    setModalText('modal-latency', `${d.processing_time_ms || 0} ms`);
    setModalText('modal-orig-prompt', d.original_prompt || 'N/A');
    setModalText('modal-opt-prompt', d.optimized_prompt || 'None');
    setModalText('modal-result', d.result_content || 'No result available');

    // Executed features
    const featContainer = document.getElementById('modal-features-list');
    if (featContainer) {
      featContainer.innerHTML = '';
      if (d.ai_features && d.ai_features.length > 0) {
        d.ai_features.forEach(f => {
          const pill = document.createElement('span');
          pill.className = 'badge badge-indigo';
          pill.textContent = f.feature_name;
          featContainer.appendChild(pill);
        });
      } else {
        featContainer.innerHTML = '<span style="color: var(--text-dim); font-size: 12px;">Standard Execution</span>';
      }
    }

    modal.classList.add('active');
  } catch (err) {
    showToast('Failed to load request details: ' + err.message, 'error');
  }
}

function renderPagination(pagination) {
  const container = document.getElementById('usage-pagination');
  if (!container) return;

  container.innerHTML = '';
  if (!pagination || pagination.totalPages <= 1) return;

  for (let i = 1; i <= pagination.totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === pagination.page ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      currentPage = i;
      loadUsageRequests();
    });
    container.appendChild(btn);
  }
}

function setModalText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
