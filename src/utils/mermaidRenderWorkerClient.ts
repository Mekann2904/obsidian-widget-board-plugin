// Mermaid Workerクライアントユーティリティ

let mermaidWorker: Worker | null = null;

function getMermaidWorker(): Worker {
  if (!mermaidWorker) {
    mermaidWorker = new Worker('src/utils/mermaidWorker.ts', { type: 'module' });
  }
  return mermaidWorker;
}

export function renderMermaidInWorker(code: string, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = getMermaidWorker();
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.id === id) {
        worker.removeEventListener('message', handleMessage);
        if (e.data.svg) {
          resolve(e.data.svg);
        } else {
          reject(e.data.error || 'Mermaid Worker Error');
        }
      }
    };
    worker.addEventListener('message', handleMessage);
    worker.postMessage({ code, id });
  });
} 