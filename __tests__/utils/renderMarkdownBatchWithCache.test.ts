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

let MarkdownRenderer: { renderMarkdown: jest.Mock };
import { renderMarkdownBatchWithCache } from '../../src/utils/renderMarkdownBatch';

describe('renderMarkdownBatchWithCache', () => {
  beforeEach(() => {
    MarkdownRenderer = require('obsidian').MarkdownRenderer as any;
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
