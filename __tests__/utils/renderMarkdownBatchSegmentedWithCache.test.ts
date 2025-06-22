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
import { MessageChannel as NodeMessageChannel } from 'worker_threads';

let MarkdownRenderer: { renderMarkdown: jest.Mock };
let renderMarkdownBatchSegmentedWithCache: any;

beforeAll(() => {
  if (typeof (global as any).MessageChannel === 'undefined') {
    (global as any).MessageChannel = NodeMessageChannel;
  }
});

describe('renderMarkdownBatchSegmentedWithCache', () => {
  beforeEach(() => {
    jest.resetModules();
    MarkdownRenderer = require('obsidian').MarkdownRenderer as any;
    renderMarkdownBatchSegmentedWithCache = require('../../src/utils/renderMarkdownBatch').renderMarkdownBatchSegmentedWithCache;
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('renders segments and caches them', async () => {
    const container1 = document.createElement('div');
    await renderMarkdownBatchSegmentedWithCache('a\n\nb', container1, '', new Component());
    await new Promise(r => setTimeout(r, 10));
    expect(container1.innerHTML).toBe('<p>a</p><p>b</p>');
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(2);

    const container2 = document.createElement('div');
    await renderMarkdownBatchSegmentedWithCache('a\n\nb', container2, '', new Component());
    await new Promise(r => setTimeout(r, 10));
    expect(container2.innerHTML).toBe('<p>a</p><p>b</p>');
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(2);
  });

  test('evicts oldest segment when cache exceeds limit', async () => {
    const segments = Array.from({ length: 101 }, (_, i) => `seg${i}`).join('\n\n');
    await renderMarkdownBatchSegmentedWithCache(segments, document.createElement('div'), '', new Component());
    await new Promise(r => setTimeout(r, 10));
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(101);

    await renderMarkdownBatchSegmentedWithCache('seg0', document.createElement('div'), '', new Component());
    await new Promise(r => setTimeout(r, 10));
    expect(MarkdownRenderer.renderMarkdown).toHaveBeenCalledTimes(102);
  });
});
