if (typeof HTMLElement !== 'undefined') {
  if (!HTMLElement.prototype.empty) {
    HTMLElement.prototype.empty = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
    };
  }
  if (!HTMLElement.prototype.createDiv) {
    HTMLElement.prototype.createDiv = function (opts = {}) {
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
