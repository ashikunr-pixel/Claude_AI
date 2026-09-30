/**
 * Claude AI Platform - Chart.js Visualizations
 */

let costTimelineChart = null;
let tokenDistributionChart = null;
let modelUsageChart = null;
let taskUsageChart = null;
let featureUsageChart = null;

// Chart.js dark theme default styling
const CHART_FONT = {
  family: "'Inter', sans-serif",
  size: 11
};

const GRID_COLOR = 'rgba(255, 255, 255, 0.05)';
const TEXT_COLOR = '#94a3b8';

function initCharts(analyticsData) {
  if (!analyticsData) return;

  renderCostTimeline(analyticsData.timeline || []);
  renderTokenDistribution(analyticsData.timeline || []);
  renderModelUsage(analyticsData.modelUsage || []);
  renderTaskUsage(analyticsData.taskTypeUsage || []);
  renderFeatureUsage(analyticsData.featureUsage || []);
}

function renderCostTimeline(timeline) {
  const canvas = document.getElementById('chart-cost-timeline');
  if (!canvas) return;

  const labels = timeline.map(t => t.date_label);
  const data = timeline.map(t => Number(t.total_cost));

  if (costTimelineChart) costTimelineChart.destroy();

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.45)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

  costTimelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['Today'],
      datasets: [{
        label: 'Cost (USD)',
        data: data.length ? data : [0],
        borderColor: '#6366f1',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#818cf8',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Cost: $${Number(ctx.raw).toFixed(6)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        },
        y: {
          grid: { color: GRID_COLOR },
          ticks: {
            color: TEXT_COLOR,
            font: CHART_FONT,
            callback: (val) => `$${Number(val).toFixed(4)}`
          }
        }
      }
    }
  });
}

function renderTokenDistribution(timeline) {
  const canvas = document.getElementById('chart-tokens-timeline');
  if (!canvas) return;

  const labels = timeline.map(t => t.date_label);
  const inTokens = timeline.map(t => t.input_tokens);
  const outTokens = timeline.map(t => t.output_tokens);

  if (tokenDistributionChart) tokenDistributionChart.destroy();

  const ctx = canvas.getContext('2d');
  tokenDistributionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Today'],
      datasets: [
        {
          label: 'Input Tokens',
          data: inTokens.length ? inTokens : [0],
          backgroundColor: '#3b82f6',
          borderRadius: 4
        },
        {
          label: 'Output Tokens',
          data: outTokens.length ? outTokens : [0],
          backgroundColor: '#10b981',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: TEXT_COLOR, font: CHART_FONT }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        },
        y: {
          stacked: true,
          grid: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        }
      }
    }
  });
}

function renderModelUsage(modelUsage) {
  const canvas = document.getElementById('chart-model-usage');
  if (!canvas) return;

  const labels = modelUsage.map(m => m.model);
  const counts = modelUsage.map(m => m.count);

  if (modelUsageChart) modelUsageChart.destroy();

  const ctx = canvas.getContext('2d');
  modelUsageChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [{
        data: counts.length ? counts : [1],
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: TEXT_COLOR, font: CHART_FONT }
        }
      },
      cutout: '68%'
    }
  });
}

function renderTaskUsage(taskUsage) {
  const canvas = document.getElementById('chart-task-usage');
  if (!canvas) return;

  const labels = taskUsage.map(t => t.task_type);
  const counts = taskUsage.map(t => t.count);

  if (taskUsageChart) taskUsageChart.destroy();

  const ctx = canvas.getContext('2d');
  taskUsageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [{
        label: 'Task Count',
        data: counts.length ? counts : [0],
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        },
        y: {
          grid: { color: 'transparent' },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        }
      }
    }
  });
}

function renderFeatureUsage(featureUsage) {
  const canvas = document.getElementById('chart-feature-usage');
  if (!canvas) return;

  const topFeatures = featureUsage.slice(0, 8);
  const labels = topFeatures.map(f => f.feature_name);
  const counts = topFeatures.map(f => f.count);

  if (featureUsageChart) featureUsageChart.destroy();

  const ctx = canvas.getContext('2d');
  featureUsageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No Features Recorded Yet'],
      datasets: [{
        label: 'Times Executed',
        data: counts.length ? counts : [0],
        backgroundColor: '#06b6d4',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: GRID_COLOR },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        },
        y: {
          grid: { color: 'transparent' },
          ticks: { color: TEXT_COLOR, font: CHART_FONT }
        }
      }
    }
  });
}
