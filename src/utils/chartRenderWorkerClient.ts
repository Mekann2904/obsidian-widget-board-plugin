// Chart.js OffscreenCanvas rendering client

let chartWorker: Worker | null = null;

function getChartWorker(): Worker {
  if (!chartWorker) {
    // @ts-ignore
    chartWorker = new Worker('src/utils/chartRenderWorker.ts', { type: 'module' });
  }
  return chartWorker;
}

export function renderChartInWorker(
  canvas: HTMLCanvasElement,
  labels: string[],
  counts: number[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!(window as any).OffscreenCanvas) {
      reject(new Error('OffscreenCanvas not supported'));
      return;
    }
    const offscreen = canvas.transferControlToOffscreen();
    const worker = getChartWorker();
    const handleMessage = (e: MessageEvent) => {
      if (e.data && (e.data.done || e.data.error)) {
        worker.removeEventListener('message', handleMessage);
        if (e.data.done) {
          resolve();
        } else {
          reject(new Error(e.data.error));
        }
      }
    };
    worker.addEventListener('message', handleMessage);
    worker.postMessage({ canvas: offscreen, width: canvas.width, height: canvas.height, labels, counts }, [offscreen]);
  });
}
