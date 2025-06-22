const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

class MockMessageChannel {
  constructor() {
    const port1 = {
      onmessage: null,
      close: () => {},
    };
    const port2 = {
      onmessage: null,
      close: () => {},
    };
    port1.postMessage = (data) => {
      if (port2.onmessage) {
        // テスト内で非同期性を模倣するため、同期的に呼び出す
        port2.onmessage({ data });
      }
    };
    port2.postMessage = (data) => {
      if (port1.onmessage) {
        port1.onmessage({ data });
      }
    };
    this.port1 = port1;
    this.port2 = port2;
  }
}

Object.defineProperty(window, 'MessageChannel', {
  writable: true,
  value: MockMessageChannel,
});

if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.empty) {
    HTMLElement.prototype.empty = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
    };
  }
  if (!HTMLElement.prototype.createDiv) {
    HTMLElement.prototype.createDiv = function (opts = {}) {
      if (typeof opts === 'string') opts = { cls: opts };
      const el = document.createElement('div');
      if (opts.cls) el.className = opts.cls;
      if (opts.text) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };
  }
  if (!HTMLElement.prototype.createEl) {
    HTMLElement.prototype.createEl = function (tag, opts = {}) {
      const el = document.createElement(tag);
      if (opts.cls) el.className = opts.cls;
      if (opts.text) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };
  }
  if (!HTMLElement.prototype.createSpan) {
    HTMLElement.prototype.createSpan = function (opts = {}) {
      return this.createEl('span', opts);
    };
  }
  if (!HTMLElement.prototype.onClickEvent) {
    HTMLElement.prototype.onClickEvent = function (callback) {
      this.addEventListener('click', callback);
    };
  }
  if (!HTMLElement.prototype.setText) {
    HTMLElement.prototype.setText = function (text) {
      this.textContent = text;
    };
  }
  if (!HTMLElement.prototype.addClass) {
    HTMLElement.prototype.addClass = function (cls) {
      this.classList.add(cls);
    };
  }
  if (!HTMLElement.prototype.setAttr) {
    HTMLElement.prototype.setAttr = function (name, value) {
      this.setAttribute(name, value);
    };
  }
}

// Stub AudioContext for environments without Web Audio API
if (typeof window !== 'undefined' && typeof window.AudioContext === 'undefined') {
  class FakeAudioContext {
    constructor() { this.currentTime = 0; this.state = 'running'; }
    createOscillator() { return { connect() {}, type: 'sine', frequency: { setValueAtTime() {} }, start() {}, stop() {}, onended: null }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() { return Promise.resolve(); }
    get destination() { return {}; }
  }
  // @ts-ignore
  window.AudioContext = FakeAudioContext;
  // @ts-ignore
  window.webkitAudioContext = FakeAudioContext;
}

// Expose createEl and createSpan globally for code that expects them
try {
  const obsidian = require('./__mocks__/obsidian.ts');
  if (typeof global !== 'undefined') {
    global.createEl = obsidian.createEl;
    global.createSpan = obsidian.createSpan;
  }
} catch {}
