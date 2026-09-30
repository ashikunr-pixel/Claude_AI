/**
 * Claude AI Platform - Results Management Controller
 */

let currentViewingTaskId = null;
let currentResultContent = '';

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('results.html')) {
    initResultsPage();
  }
});

async function initResultsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetTaskId = urlParams.get('task_id');

  if (targetTaskId) {
    await loadSpecificResult(targetTaskId);
  } else {
    // Load most recent task result
    try {
      const res = await api.getTasks({ limit: 1 });
      if (res.data && res.data.length > 0) {
        await loadSpecificResult(res.data[0].task_id);
      } else {
        document.getElementById('result-viewer-pane').innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-dim);">No generated results found yet. Run an AI task first in the Studio!</div>';
      }
    } catch (err) {
      console.warn(err);
    }
  }

  setupDownloadButtons();
}

async function loadSpecificResult(taskId) {
  currentViewingTaskId = taskId;
  const container = document.getElementById('result-viewer-content');
  const metaBar = document.getElementById('result-viewer-meta');

  if (container) {
    container.innerHTML = '<div style="padding: 40px; text-align: center;">Loading result...</div>';
  }

  try {
    const res = await api.getResult(taskId);
    const d = res.data;
    currentResultContent = d.result_content;

    if (metaBar) {
      metaBar.innerHTML = `
        <span>Task <strong>#${d.task_id}</strong> (${d.task_type})</span>
        <span>Model: <strong>${d.model || 'Claude'}</strong></span>
        <span>Tokens: <strong>${Number(d.total_tokens || 0).toLocaleString()}</strong></span>
        <span>Cost: <strong style="color: #34d399;">$${Number(d.request_cost || 0).toFixed(6)}</strong></span>
        <span>Format: <strong>${(d.result_format || 'text').toUpperCase()}</strong></span>
      `;
    }

    if (container) {
      if (d.result_format === 'json') {
        container.innerHTML = `<pre><code>${escapeHtml(d.result_content)}</code></pre>`;
      } else {
        container.innerHTML = formatMarkdown(d.result_content);
      }
    }

  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--accent-rose);">${err.message}</div>`;
    }
  }
}

function setupDownloadButtons() {
  const btnCopy = document.getElementById('btn-copy-view');
  const btnTxt = document.getElementById('btn-dl-txt-view');
  const btnMd = document.getElementById('btn-dl-md-view');
  const btnJson = document.getElementById('btn-dl-json-view');
  const btnExcel = document.getElementById('btn-dl-excel-view');

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      if (!currentResultContent) return showToast('No content to copy.', 'warning');
      navigator.clipboard.writeText(currentResultContent);
      showToast('Result copied to clipboard!', 'success');
    });
  }

  if (btnTxt) {
    btnTxt.addEventListener('click', () => {
      if (!currentViewingTaskId) return;
      window.location.href = api.downloadResultUrl(currentViewingTaskId, 'txt');
    });
  }
  if (btnMd) {
    btnMd.addEventListener('click', () => {
      if (!currentViewingTaskId) return;
      window.location.href = api.downloadResultUrl(currentViewingTaskId, 'md');
    });
  }
  if (btnJson) {
    btnJson.addEventListener('click', () => {
      if (!currentViewingTaskId) return;
      window.location.href = api.downloadResultUrl(currentViewingTaskId, 'json');
    });
  }
  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      if (!currentViewingTaskId) return;
      window.location.href = api.downloadResultUrl(currentViewingTaskId, 'xlsx');
    });
  }
}

function formatMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/\n$/gim, '<br />')
    .replace(/\n\n/gim, '<br /><br />');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
