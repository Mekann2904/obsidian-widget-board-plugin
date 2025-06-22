export class App {}
export class Component {}
export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;

  constructor(path = 'test.md') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.basename = this.name.replace(/\.md$/, '');
    this.extension = 'md';
  }
}
export class TFolder { path = ''; }
export class Modal {}
export class Notice { constructor(public message?: string) {} }
export const MarkdownRenderer = {
  renderMarkdown: jest.fn((md: string, el: HTMLElement) => {
    el.innerHTML = `<p>${md}</p>`;
    return Promise.resolve();
  }),
};
export function createEl(tag: string, opts: any = {}, parent?: HTMLElement): HTMLElement {
  const el = document.createElement(tag);
  if (opts.cls) el.className = opts.cls;
  if (opts.text) el.textContent = opts.text;
  if (opts.type) el.setAttribute('type', opts.type);
  if (opts.attr) {
    for (const [k, v] of Object.entries(opts.attr)) {
      el.setAttribute(k, String(v));
    }
  }
  if (parent) parent.appendChild(el);
  return el;
}
export function createSpan(opts: any = {}, parent?: HTMLElement): HTMLElement {
  return createEl('span', opts, parent);
}
export function setIcon(el: HTMLElement | null, icon: string): void {
  if (el) { (el as any).dataset.icon = icon; }
}
export function requestUrl(_opts: any): Promise<any> {
  return Promise.resolve({ status: 200, text: '', json: {} });
}
export class FuzzySuggestModal {}
export const debounce = (fn: any) => fn;
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export class Setting {
  constructor(private containerEl: HTMLElement) {}
  setName(name: string) {
    this.containerEl.createEl('div', { text: name });
    return this;
  }
  setHeading() {
    return this;
  }
  addText(cb: (text: any) => any) {
    const text = {
      setPlaceholder: () => text,
      setValue: () => text,
      onChange: () => text,
    };
    cb(text);
    return this;
  }
}
