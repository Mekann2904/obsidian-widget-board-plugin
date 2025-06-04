import { MarkdownRenderer, Component } from 'obsidian';

jest.mock('obsidian');

describe('renderMarkdownBatchWithCache', () => {
  let renderMarkdownBatchWithCache: typeof import('../src/utils/renderMarkdownBatch').renderMarkdownBatchWithCache;

  beforeEach(async () => {
    jest.resetModules();
    ({ renderMarkdownBatchWithCache } = await import('../src/utils/renderMarkdownBatch'));
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('caches rendered output', async () => {
    const container1 = document.createElement('div');
    await renderMarkdownBatchWithCache('sample', container1, '', new Component());
    expect((MarkdownRenderer.renderMarkdown as jest.Mock).mock.calls.length).toBe(1);

    const container2 = document.createElement('div');
    await renderMarkdownBatchWithCache('sample', container2, '', new Component());
    expect((MarkdownRenderer.renderMarkdown as jest.Mock).mock.calls.length).toBe(1);
    expect(container2.innerHTML).toBe(container1.innerHTML);
  });

  test('respects cache size limit', async () => {
    for (let i = 0; i < 1000; i++) {
      await renderMarkdownBatchWithCache(`md${i}`, document.createElement('div'), '', new Component());
    }
    expect((MarkdownRenderer.renderMarkdown as jest.Mock).mock.calls.length).toBe(1000);

    await renderMarkdownBatchWithCache('extra', document.createElement('div'), '', new Component());
    expect((MarkdownRenderer.renderMarkdown as jest.Mock).mock.calls.length).toBe(1001);

    await renderMarkdownBatchWithCache('md0', document.createElement('div'), '', new Component());
    expect((MarkdownRenderer.renderMarkdown as jest.Mock).mock.calls.length).toBe(1002);
  });
});
