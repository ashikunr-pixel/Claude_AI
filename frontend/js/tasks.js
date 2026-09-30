/**
 * Claude AI Platform - Tasks Controller
 */

let tasksPage = 1;
const TASKS_LIMIT = 15;

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('tasks.html')) {
    initTasksPage();
  }
});

function initTasksPage() {
  loadTasks();
}

async function loadTasks() {
  const tbody = document.getElementById('tasks-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px;">Loading tasks...</td></tr>';

  try {
    const res = await api.getTasks({ page: tasksPage, limit: TASKS_LIMIT });
    const tasks = res.data;
    const pagination = res.pagination;

    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--text-dim);">No tasks recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    tasks.forEach(t => {
      const tr = document.createElement('tr');
      const dateStr = new Date(t.created_at).toLocaleString();
      const statusBadge = t.status === 'COMPLETED'
        ? '<span class="badge badge-success">Completed</span>'
        : t.status === 'PROCESSING'
        ? '<span class="badge badge-warning">Processing</span>'
        : '<span class="badge badge-danger">Failed</span>';

      tr.innerHTML = `
        <td class="mono-cell">#${t.task_id}</td>
        <td><span class="badge badge-indigo">${t.task_type}</span></td>
        <td>${statusBadge}</td>
        <td class="mono-cell">${t.model || 'N/A'}</td>
        <td class="mono-cell">${t.total_tokens ? Number(t.total_tokens).toLocaleString() : 0}</td>
        <td>${dateStr}</td>
        <td>
          <div class="action-icons-group">
            <button class="btn btn-secondary btn-sm" onclick="viewTaskResult(${t.task_id})">View Result</button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    renderTasksPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

function viewTaskResult(taskId) {
  window.location.href = `results.html?task_id=${taskId}`;
}

function renderTasksPagination(pagination) {
  const container = document.getElementById('tasks-pagination');
  if (!container || !pagination || pagination.totalPages <= 1) return;

  container.innerHTML = '';
  for (let i = 1; i <= pagination.totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === pagination.page ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      tasksPage = i;
      loadTasks();
    });
    container.appendChild(btn);
  }
}
