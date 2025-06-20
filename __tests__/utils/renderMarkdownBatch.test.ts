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
const { renderMarkdownBatch } = require('../../src/utils/renderMarkdownBatch.ts');

describe('renderMarkdownBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  test('renders markdown into container', async () => {
    const container = document.createElement('div');
    await renderMarkdownBatch('hello', container, '', new Component());
    expect(container.innerHTML).toBe('<p>hello</p>');
    expect(document.body.childElementCount).toBe(0);
  });
});
