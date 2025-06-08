// Mock Worker
class MockWorker {
  listeners: any = {};
  postMessage(_msg: any, _transfer?: any[]) {
    setTimeout(() => {
      this.listeners['message']?.({ data: { done: true } });
    }, 0);
  }
  addEventListener(type: string, cb: any) {
    this.listeners[type] = cb;
  }
  removeEventListener(type: string, _cb: any) {
    delete this.listeners[type];
  }
}
(global as any).Worker = MockWorker;

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_type: string) { return {}; }
}
(global as any).OffscreenCanvas = FakeOffscreenCanvas;

import { renderChartInWorker } from '../../src/utils/chartRenderWorkerClient';

describe('renderChartInWorker', () => {
  it('resolves after worker completes', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;
    // @ts-ignore
    canvas.transferControlToOffscreen = () => new FakeOffscreenCanvas(canvas.width, canvas.height);
    await expect(renderChartInWorker(canvas, ['a'], [1])).resolves.toBeUndefined();
  });
});
