// CSS外側パネルのスタイルテスト
// DOMにCSSを動的に注入してテスト

describe('Outer Panel CSS Styles', () => {
  let testElement: HTMLElement;
  let styleElement: HTMLStyleElement;

  beforeEach(() => {
    // テスト用のCSS（実際のstyles.cssから抜粋）
    const cssContent = `
      .widget-board-panel-custom.mode-right-outer {
        width: 32vw !important;
        right: 0 !important;
        transform: translateX(100%);
        opacity: 0;
        z-index: 1000 !important;
      }
      .widget-board-panel-custom.mode-right-outer.is-open {
        transform: translateX(0);
        opacity: 1;
      }
      .widget-board-panel-custom.mode-left-outer {
        width: 32vw !important;
        left: 0 !important;
        transform: translateX(-100%);
        opacity: 0;
        z-index: 1000 !important;
      }
      .widget-board-panel-custom.mode-left-outer.is-open {
        transform: translateX(0);
        opacity: 1;
      }
      body.wb-modal-right-outer-open {
        padding-right: 32vw;
      }
      body.wb-modal-left-outer-open {
        padding-left: 32vw;
      }
    `;

    // CSSをDOMに挿入
    styleElement = document.createElement('style');
    styleElement.textContent = cssContent;
    document.head.appendChild(styleElement);

    // テスト用要素を作成
    testElement = document.createElement('div');
    testElement.className = 'widget-board-panel-custom';
    document.body.appendChild(testElement);
  });

  afterEach(() => {
    // クリーンアップ
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    if (testElement && testElement.parentNode) {
      testElement.parentNode.removeChild(testElement);
    }
    // body クラスをクリーンアップ
    document.body.className = '';
  });

  describe('RIGHT_OUTER mode', () => {
    it('mode-right-outerクラスが適用された際の初期スタイル', () => {
      testElement.classList.add('mode-right-outer');
      
      const computedStyle = window.getComputedStyle(testElement);
      
      expect(computedStyle.width).toBe('32vw');
      expect(computedStyle.right).toBe('0px');
      expect(computedStyle.transform).toBe('translateX(100%)');
      expect(computedStyle.opacity).toBe('0');
      expect(computedStyle.zIndex).toBe('1000');
    });

    it('is-openクラス追加時のアニメーションスタイル', () => {
      testElement.classList.add('mode-right-outer', 'is-open');
      
      const computedStyle = window.getComputedStyle(testElement);
      
      expect(computedStyle.transform).toBe('translateX(0)');
      expect(computedStyle.opacity).toBe('1');
    });

    it('bodyにwb-modal-right-outer-openクラスが適用された際のpadding', () => {
      document.body.classList.add('wb-modal-right-outer-open');
      
      const computedStyle = window.getComputedStyle(document.body);
      
      expect(computedStyle.paddingRight).toBe('32vw');
    });
  });

  describe('LEFT_OUTER mode', () => {
    it('mode-left-outerクラスが適用された際の初期スタイル', () => {
      testElement.classList.add('mode-left-outer');
      
      const computedStyle = window.getComputedStyle(testElement);
      
      expect(computedStyle.width).toBe('32vw');
      expect(computedStyle.left).toBe('0px');
      expect(computedStyle.transform).toBe('translateX(-100%)');
      expect(computedStyle.opacity).toBe('0');
      expect(computedStyle.zIndex).toBe('1000');
    });

    it('is-openクラス追加時のアニメーションスタイル', () => {
      testElement.classList.add('mode-left-outer', 'is-open');
      
      const computedStyle = window.getComputedStyle(testElement);
      
      expect(computedStyle.transform).toBe('translateX(0)');
      expect(computedStyle.opacity).toBe('1');
    });

    it('bodyにwb-modal-left-outer-openクラスが適用された際のpadding', () => {
      document.body.classList.add('wb-modal-left-outer-open');
      
      const computedStyle = window.getComputedStyle(document.body);
      
      expect(computedStyle.paddingLeft).toBe('32vw');
    });
  });

  describe('Class transition behavior', () => {
    it('mode-right-outerからmode-left-outerへの切り替えでスタイルが正しく変更される', () => {
      // 最初にright-outerを適用
      testElement.classList.add('mode-right-outer');
      let computedStyle = window.getComputedStyle(testElement);
      expect(computedStyle.right).toBe('0px');
      expect(computedStyle.transform).toBe('translateX(100%)');

      // left-outerに切り替え
      testElement.classList.remove('mode-right-outer');
      testElement.classList.add('mode-left-outer');
      
      computedStyle = window.getComputedStyle(testElement);
      expect(computedStyle.left).toBe('0px');
      expect(computedStyle.transform).toBe('translateX(-100%)');
    });

    it('is-openクラスの追加・削除でopacityとtransformが正しく変更される', () => {
      testElement.classList.add('mode-right-outer');
      
      // is-openクラスなし
      let computedStyle = window.getComputedStyle(testElement);
      expect(computedStyle.opacity).toBe('0');
      expect(computedStyle.transform).toBe('translateX(100%)');

      // is-openクラス追加
      testElement.classList.add('is-open');
      computedStyle = window.getComputedStyle(testElement);
      expect(computedStyle.opacity).toBe('1');
      expect(computedStyle.transform).toBe('translateX(0)');

      // is-openクラス削除
      testElement.classList.remove('is-open');
      computedStyle = window.getComputedStyle(testElement);
      expect(computedStyle.opacity).toBe('0');
      expect(computedStyle.transform).toBe('translateX(100%)');
    });
  });

  describe('z-index priority', () => {
    it('outer modeのz-indexが通常より高い値に設定される', () => {
      const regularElement = document.createElement('div');
      regularElement.className = 'widget-board-panel-custom';
      document.body.appendChild(regularElement);

      testElement.classList.add('mode-right-outer');
      
      const outerStyle = window.getComputedStyle(testElement);
      const regularStyle = window.getComputedStyle(regularElement);
      
      expect(parseInt(outerStyle.zIndex)).toBeGreaterThan(parseInt(regularStyle.zIndex) || 0);
      
      document.body.removeChild(regularElement);
    });
  });
}); 