import { createAccordion } from '../../src/utils/uiHelpers';

beforeAll(() => {
  if (!(HTMLElement.prototype as any).appendText) {
    (HTMLElement.prototype as any).appendText = function(text: string) {
      this.appendChild(document.createTextNode(text));
    };
  }
});

describe('createAccordion', () => {
  test('creates accordion and toggles body visibility', () => {
    const container = document.createElement('div');
    const { acc, header, body } = createAccordion(container, 'Title', false);

    expect(container.contains(acc)).toBe(true);
    expect(header.textContent).toContain('Title');
    expect(body.style.display).toBe('none');

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(acc.classList.contains('wb-accordion-open')).toBe(true);
    expect(body.style.display).toBe('');

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(acc.classList.contains('wb-accordion-open')).toBe(false);
    expect(body.style.display).toBe('none');
  });

  test('defaultOpen expands initially', () => {
    const container = document.createElement('div');
    const { acc, header, body } = createAccordion(container, 'Title', true);
    expect(acc.classList.contains('wb-accordion-open')).toBe(true);
    expect(header.classList.contains('wb-accordion-open')).toBe(true);
    expect(body.style.display).toBe('');
  });
});
