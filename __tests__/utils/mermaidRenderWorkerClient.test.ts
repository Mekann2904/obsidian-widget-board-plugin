// Workerのモック
class MockWorker {
  onmessage: ((e: any) => void) | null = null;
  listeners: any = {};
  constructor() {}
  postMessage(msg: any) {
    // 正常系
    if (msg.code === 'graph TD; A-->B;') {
      setTimeout(() => {
        this.listeners['message']?.({ data: { svg: '<svg>A--&gt;B</svg>', id: msg.id } });
      }, 0);
    } else {
      // 異常系
      setTimeout(() => {
        this.listeners['message']?.({ data: { error: 'Parse error', id: msg.id } });
      }, 0);
    }
  }
  addEventListener(type: string, cb: any) {
    this.listeners[type] = cb;
  }
  removeEventListener(type: string, cb: any) {
    delete this.listeners[type];
  }
}
(global as any).Worker = MockWorker;

import { renderMermaidInWorker } from '../../src/utils/mermaidRenderWorkerClient';

describe('renderMermaidInWorker', () => {
  it('正常なMermaid記法をSVGに変換できる', async () => {
    const code = 'graph TD; A-->B;';
    const id = 'test1';
    const svg = await renderMermaidInWorker(code, id);
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    expect(svg).toContain('A--&gt;B');
  });

  it('不正なMermaid記法の場合はエラーになる', async () => {
    const code = 'graph TD; A-=>B;'; // 不正な矢印
    const id = 'test2';
    await expect(renderMermaidInWorker(code, id)).rejects.toBeDefined();
  });
}); 