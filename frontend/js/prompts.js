/**
 * Claude AI Platform - Prompt History Controller
 */

let promptPage = 1;
const PROMPT_LIMIT = 15;

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('prompts.html')) {
    initPromptsPage();
  }
});

function initPromptsPage() {
  const searchInput = document.getElementById('prompts-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      promptPage = 1;
      loadPrompts();
    }, 400));
  }

  loadPrompts();
}

async function loadPrompts() {
  const tbody = document.getElementById('prompts-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px;">Loading prompt history...</td></tr>';
  const search = document.getElementById('prompts-search')?.value || '';

  try {
    const res = await api.getPrompts({
      search,
      page: promptPage,
      limit: PROMPT_LIMIT
    });

    const prompts = res.data;
    const pagination = res.pagination;

    if (prompts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--text-dim);">No prompts found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    prompts.forEach(p => {
      const tr = document.createElement('tr');
      const dateStr = new Date(p.created_at).toLocaleDateString();

      const shortOrig = p.original_prompt.length > 55 ? p.original_prompt.substring(0, 55) + '...' : p.original_prompt;
      const shortOpt = p.optimized_prompt && p.optimized_prompt.length > 55 ? p.optimized_prompt.substring(0, 55) + '...' : (p.optimized_prompt || 'Standard');

      tr.innerHTML = `
        <td class="mono-cell">#${p.prompt_id}</td>
        <td>${dateStr}</td>
        <td><span class="badge badge-indigo">${p.task_type || 'Custom'}</span></td>
        <td><span class="badge badge-success">${p.optimization_mode || 'Standard'}</span></td>
        <td title="${escapeHtml(p.original_prompt)}">${escapeHtml(shortOrig)}</td>
        <td class="mono-cell" style="color: #34d399;">$${p.request_cost ? Number(p.request_cost).toFixed(6) : '0.000000'}</td>
        <td>
          <div class="action-icons-group">
            <button class="btn btn-secondary btn-sm" onclick="reusePrompt('${encodeURIComponent(p.original_prompt)}')">Reuse</button>
            <button class="btn btn-outline btn-sm" onclick="optimizeAgain('${encodeURIComponent(p.original_prompt)}')">Optimize Again</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    renderPromptsPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function reusePrompt(encodedPrompt) {
  const promptText = decodeURIComponent(encodedPrompt);
  localStorage.setItem('claude_reuse_prompt', promptText);
  window.location.href = 'processor.html?action=reuse';
}

function optimizeAgain(encodedPrompt) {
  const promptText = decodeURIComponent(encodedPrompt);
  localStorage.setItem('claude_reuse_prompt', promptText);
  window.location.href = 'processor.html?action=optimize';
}

function renderPromptsPagination(pagination) {
  const container = document.getElementById('prompts-pagination');
  if (!container || !pagination || pagination.totalPages <= 1) return;

  container.innerHTML = '';
  for (let i = 1; i <= pagination.totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === pagination.page ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      promptPage = i;
      loadPrompts();
    });
    container.appendChild(btn);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
