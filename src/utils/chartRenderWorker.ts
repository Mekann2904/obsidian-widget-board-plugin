// Chart.js rendering worker using OffscreenCanvas
// Loads Chart.js from CDN and renders a line chart onto OffscreenCanvas
// Input message: { canvas, width, height, labels, counts }
// Sends back { done: true } when rendering is complete

// @ts-ignore
self.importScripts('https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js');

let chart: any = null;

self.onmessage = (e) => {
  const { canvas, width, height, labels, counts } = e.data;
  if (!canvas) {
    self.postMessage({ error: 'No canvas provided' });
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    self.postMessage({ error: 'Unable to get context' });
    return;
  }
  if (chart) {
    // destroy previous chart instance
    chart.destroy();
    chart = null;
  }
  // eslint-disable-next-line no-undef
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '投稿数',
        data: counts,
        borderColor: '#4a90e2',
        backgroundColor: 'rgba(74,144,226,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } },
        y: { beginAtZero: true, grid: { color: '#eee' } }
      }
    }
  });
  // wait for one frame to ensure drawing is finished
  requestAnimationFrame(() => {
    self.postMessage({ done: true });
  });
};
