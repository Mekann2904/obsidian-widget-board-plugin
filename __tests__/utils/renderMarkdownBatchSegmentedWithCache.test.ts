// Provide a virtual mock for the Obsidian API used in the utils
jest.mock('obsidian', () => {
  return {
    MarkdownRenderer: {
      renderMarkdown: jest.fn((md: string, el: HTMLElement) => {
        el.innerHTML = `<p>${md}</p>`;
        return Promise.resolve();
      }),
    },
    Component: class {},
    TFile: class {},
  };
}, { virtual: true });

import { Component } from 'obsidian';

if (typeof (global as any).MessageChannel === 'undefined') {
  const { MessageChannel } = require('worker_threads');
  (global as any).MessageChannel = MessageChannel;
}

let MarkdownRenderer: { renderMarkdown: jest.Mock };
import { renderMarkdownBatchSegmentedWithCache } from '../../src/utils/renderMarkdownBatch';

const flush = () => new Promise(res => setTimeout(res, 0));

describe('renderMarkdownBatchSegmentedWithCache', () => {
  beforeEach(() => {
    MarkdownRenderer = require('obsidian').MarkdownRenderer as any;
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('renders segments sequentially', async () => {
    const container = document.createElement('div');
    await renderMarkdownBatchSegmentedWithCache('a\n\nb', container, '', new Component());
    await flush();
    await flush();
    expect(container.innerHTML).toBe('<p>a</p><p>b</p>');
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(2);
  });

  test('reuses cached segments', async () => {
    const container1 = document.createElement('div');
    await renderMarkdownBatchSegmentedWithCache('x\n\ny', container1, '', new Component());
    await flush();
    await flush();
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(2);

    jest.clearAllMocks();
    const container2 = document.createElement('div');
    await renderMarkdownBatchSegmentedWithCache('x\n\ny', container2, '', new Component());
    await flush();
    await flush();
    expect(MarkdownRenderer.renderMarkdown).not.toHaveBeenCalled();
    expect(container2.innerHTML).toBe(container1.innerHTML);
  });

  test('respects cache size limit', async () => {
    for (let i = 0; i < 100; i++) {
      await renderMarkdownBatchSegmentedWithCache(`seg${i}`, document.createElement('div'), '', new Component());
      await flush();
    }
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(100);

    await renderMarkdownBatchSegmentedWithCache('extra', document.createElement('div'), '', new Component());
    await flush();
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(101);

    await renderMarkdownBatchSegmentedWithCache('seg0', document.createElement('div'), '', new Component());
    await flush();
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(102);
  });
});
