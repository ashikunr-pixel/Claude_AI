/**
 * Claude AI Platform - File Manager Controller
 */

let filesPage = 1;
const FILES_LIMIT = 15;

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('files.html')) {
    initFilesPage();
  }
});

function initFilesPage() {
  loadFiles();

  // Close modal
  const modalClose = document.getElementById('file-modal-close-btn');
  const modal = document.getElementById('file-preview-modal');
  if (modalClose && modal) {
    modalClose.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }
}

async function loadFiles() {
  const tbody = document.getElementById('files-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px;">Loading files...</td></tr>';

  try {
    const res = await api.getFiles({ page: filesPage, limit: FILES_LIMIT });
    const files = res.data;
    const pagination = res.pagination;

    if (files.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--text-dim);">No files uploaded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    files.forEach(f => {
      const tr = document.createElement('tr');
      const dateStr = new Date(f.created_at).toLocaleDateString();
      const sizeStr = (f.file_size / 1024).toFixed(1) + ' KB';

      tr.innerHTML = `
        <td class="mono-cell">#${f.file_id}</td>
        <td><strong>${escapeHtml(f.file_name)}</strong></td>
        <td><span class="badge badge-indigo">${f.file_type}</span></td>
        <td class="mono-cell">${sizeStr}</td>
        <td>${dateStr}</td>
        <td><span class="badge badge-success">${f.task_status || 'Processed'}</span></td>
        <td>
          <div class="action-icons-group">
            <button class="btn btn-secondary btn-sm" onclick="previewFileText(${f.file_id})">View Text</button>
            <a class="btn btn-outline btn-sm" href="/api/files/${f.file_id}/download?token=${encodeURIComponent(api.getToken())}" target="_blank">Download</a>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    renderFilesPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color: var(--accent-rose);">${err.message}</td></tr>`;
  }
}

async function previewFileText(fileId) {
  try {
    const res = await api.getFileById(fileId);
    const d = res.data;

    const modal = document.getElementById('file-preview-modal');
    const nameEl = document.getElementById('preview-file-name');
    const textEl = document.getElementById('preview-file-content');

    if (nameEl) nameEl.textContent = `${d.file_name} (Extracted Text)`;
    if (textEl) textEl.textContent = d.extracted_text || 'No extracted text available.';

    if (modal) modal.classList.add('active');
  } catch (err) {
    showToast('Failed to preview file: ' + err.message, 'error');
  }
}

function renderFilesPagination(pagination) {
  const container = document.getElementById('files-pagination');
  if (!container || !pagination || pagination.totalPages <= 1) return;

  container.innerHTML = '';
  for (let i = 1; i <= pagination.totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === pagination.page ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      filesPage = i;
      loadFiles();
    });
    container.appendChild(btn);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
