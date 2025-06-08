let chartWorker: Worker | null = null;

function getChartWorker(): Worker {
  if (!chartWorker) {
    // @ts-ignore
    chartWorker = new Worker('src/utils/chartWorker.ts', { type: 'module' });
  }
  return chartWorker;
}

export function renderChartInWorker(labels: string[], data: number[], width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!('OffscreenCanvas' in globalThis)) {
      reject(new Error('OffscreenCanvas not supported'));
      return;
    }
    const worker = getChartWorker();
    const id = Math.random().toString(36).slice(2);
    const handle = (e: MessageEvent) => {
      if (e.data && e.data.id === id) {
        worker.removeEventListener('message', handle);
        if (e.data.dataUrl) {
          resolve(e.data.dataUrl as string);
        } else {
          reject(new Error('Chart worker error'));
        }
      }
    };
    worker.addEventListener('message', handle);
    worker.postMessage({ id, labels, data, width, height });
  });
}
