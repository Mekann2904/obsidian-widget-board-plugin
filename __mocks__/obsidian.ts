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
export class Modal {
  app: any;
  contentEl: HTMLElement;
  modalEl: HTMLElement;
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  
  constructor(app: any) {
    this.app = app;
    this.modalEl = createEl('div');
    this.contentEl = createEl('div', {}, this.modalEl);
  }
  
  open() {
    this.onOpen();
  }
  
  close() {
    this.onClose();
  }
}
export class Notice { constructor(public message?: string) {} }
export class ButtonComponent {
  buttonEl: HTMLElement;
  
  constructor(containerEl: HTMLElement) {
    this.buttonEl = createEl('button', {}, containerEl);
  }
  
  setButtonText(text: string) {
    this.buttonEl.textContent = text;
    return this;
  }
  
  setClass(cls: string) {
    this.buttonEl.classList.add(cls);
    return this;
  }
  
  onClick(callback: () => void) {
    this.buttonEl.addEventListener('click', callback);
    return this;
  }
}
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
  
  // モックのDOMメソッドを追加
  (el as any).createEl = (tag: string, opts: any = {}) => createEl(tag, opts, el);
  (el as any).createDiv = (opts: any = {}) => createEl('div', opts, el);
  (el as any).createSpan = (opts: any = {}) => createEl('span', opts, el);
  (el as any).createButton = (opts: any = {}) => createEl('button', opts, el);
  (el as any).empty = () => { el.innerHTML = ''; };
  (el as any).show = () => { el.style.display = ''; };
  (el as any).hide = () => { el.style.display = 'none'; };
  (el as any).addClass = (cls: string) => { el.classList.add(cls); };
  (el as any).removeClass = (cls: string) => { el.classList.remove(cls); };
  (el as any).setText = (text: string) => { el.textContent = text; };
  (el as any).appendText = (text: string) => { el.textContent += text; };
  
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

export class PluginSettingTab {
  constructor(public app: any, public plugin: any) {}
  display() {}
  hide() {}
  containerEl = createEl('div');
}

export class Setting {
  settingEl: HTMLElement;
  
  constructor(private containerEl: HTMLElement) {
    this.settingEl = createEl('div', {}, containerEl);
  }
  
  setName(name: string) {
    this.settingEl.createEl('div', { text: name });
    return this;
  }
  
  setHeading() {
    return this;
  }
  
  setDesc(desc: string) {
    this.settingEl.createEl('div', { text: desc });
    return this;
  }
  
  addText(cb: (text: any) => any) {
    const inputEl = createEl('input', { type: 'text' }) as HTMLInputElement;
    const text = {
      inputEl,
      setPlaceholder: (placeholder: string) => { inputEl.placeholder = placeholder; return text; },
      setValue: (value: string) => { inputEl.value = value; return text; },
      onChange: (callback: any) => { text.onChangeCallback = callback; return text; },
      onChangeCallback: null as any
    };
    inputEl.addEventListener('blur', () => {
      if (text.onChangeCallback) text.onChangeCallback();
    });
    this.settingEl.appendChild(inputEl);
    cb(text);
    return this;
  }
  
  addDropdown(cb: (dropdown: any) => any) {
    const selectEl = createEl('select') as HTMLSelectElement;
    const dropdown = {
      selectEl,
      addOption: (value: string, text: string) => {
        const option = createEl('option', { text }) as HTMLOptionElement;
        option.value = value;
        selectEl.appendChild(option);
        return dropdown;
      },
      setValue: (value: string) => { selectEl.value = value; return dropdown; },
      onChange: (callback: any) => { selectEl.addEventListener('change', (e) => callback((e.target as HTMLSelectElement).value)); return dropdown; },
      setDisabled: (disabled: boolean) => { selectEl.disabled = disabled; return dropdown; }
    };
    this.settingEl.appendChild(selectEl);
    cb(dropdown);
    return this;
  }
  
  addToggle(cb: (toggle: any) => any) {
    const inputEl = createEl('input', { type: 'checkbox' }) as HTMLInputElement;
    const toggle = {
      setValue: (value: boolean) => { inputEl.checked = value; return toggle; },
      onChange: (callback: any) => { inputEl.addEventListener('change', (e) => callback((e.target as HTMLInputElement).checked)); return toggle; }
    };
    this.settingEl.appendChild(inputEl);
    cb(toggle);
    return this;
  }
  
  addTextArea(cb: (textarea: any) => any) {
    const textareaEl = createEl('textarea') as HTMLTextAreaElement;
    const textarea = {
      setPlaceholder: (placeholder: string) => { textareaEl.placeholder = placeholder; return textarea; },
      setValue: (value: string) => { textareaEl.value = value; return textarea; },
      onChange: (callback: any) => { textareaEl.addEventListener('input', (e) => callback((e.target as HTMLTextAreaElement).value)); return textarea; }
    };
    this.settingEl.appendChild(textareaEl);
    cb(textarea);
    return this;
  }
  
  addButton(cb: (button: any) => any) {
    const buttonEl = createEl('button');
    const button = {
      setButtonText: (text: string) => { buttonEl.textContent = text; return button; },
      setCta: () => { buttonEl.classList.add('mod-cta'); return button; },
      setWarning: () => { buttonEl.classList.add('mod-warning'); return button; },
      setDisabled: (disabled: boolean) => { (buttonEl as HTMLButtonElement).disabled = disabled; return button; },
      onClick: (callback: any) => { buttonEl.addEventListener('click', callback); return button; }
    };
    this.settingEl.appendChild(buttonEl);
    cb(button);
    return this;
  }
  
  addExtraButton(cb: (button: any) => any) {
    const buttonEl = createEl('button');
    const button = {
      setIcon: (icon: string) => { setIcon(buttonEl, icon); return button; },
      setTooltip: (tooltip: string) => { buttonEl.title = tooltip; return button; },
      onClick: (callback: any) => { buttonEl.addEventListener('click', callback); return button; }
    };
    this.settingEl.appendChild(buttonEl);
    cb(button);
    return this;
  }
  
  addSlider(cb: (slider: any) => any) {
    const inputEl = createEl('input', { type: 'range' }) as HTMLInputElement;
    const slider = {
      sliderEl: inputEl,
      setLimits: (min: number, max: number, step: number) => { 
        inputEl.min = String(min); 
        inputEl.max = String(max); 
        inputEl.step = String(step);
        return slider;
      },
      setValue: (value: number) => { inputEl.value = String(value); return slider; },
      onChange: (callback: any) => { inputEl.addEventListener('input', (e) => callback(parseFloat((e.target as HTMLInputElement).value))); return slider; }
    };
    this.settingEl.appendChild(inputEl);
    cb(slider);
    return this;
  }
}
