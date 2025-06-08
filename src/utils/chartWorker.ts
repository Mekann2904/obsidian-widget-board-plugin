let Chart: any;

self.onmessage = async (e) => {
  const { id, labels, data, width, height } = e.data;
  if (!Chart) {
    const mod = await import('chart.js/auto');
    Chart = mod.default;
  }
  const Offscreen = (self as any).OffscreenCanvas;
  const canvas = new Offscreen(width, height);
  const ctx = canvas.getContext('2d');
  new Chart(ctx as any, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '投稿数',
        data,
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
  await new Promise(r => setTimeout(r, 0));
  const blob = await canvas.convertToBlob();
  const reader = new FileReader();
  reader.onload = () => {
    self.postMessage({ id, dataUrl: reader.result });
  };
  reader.readAsDataURL(blob);
};
