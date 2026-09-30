/**
 * Claude AI Platform - Export Center Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.endsWith('exports.html')) {
    initExportCenter();
  }
});

function initExportCenter() {
  const btnUsageJson = document.getElementById('export-usage-json');
  const btnUsageExcel = document.getElementById('export-usage-excel');
  const btnCompleteExcel = document.getElementById('export-complete-excel');
  const btnCompleteJson = document.getElementById('export-complete-json');

  if (btnUsageJson) {
    btnUsageJson.addEventListener('click', () => {
      showToast('Preparing usage JSON export...', 'info');
      window.location.href = api.getExportUrl('usage/json');
    });
  }

  if (btnUsageExcel) {
    btnUsageExcel.addEventListener('click', () => {
      showToast('Generating formatted Excel usage report...', 'info');
      window.location.href = api.getExportUrl('usage/excel');
    });
  }

  if (btnCompleteExcel) {
    btnCompleteExcel.addEventListener('click', () => {
      showToast('Generating complete master 10-sheet Excel workbook...', 'info');
      window.location.href = api.getExportUrl('report/excel');
    });
  }

  if (btnCompleteJson) {
    btnCompleteJson.addEventListener('click', () => {
      showToast('Compiling complete system JSON export...', 'info');
      window.location.href = api.getExportUrl('report/json');
    });
  }
}
