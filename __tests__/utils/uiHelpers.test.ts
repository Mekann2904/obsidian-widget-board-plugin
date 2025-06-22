import { createAccordion } from '../../src/utils/uiHelpers';

if (!HTMLElement.prototype.appendText) {
  HTMLElement.prototype.appendText = function (text: string) {
    this.appendChild(document.createTextNode(text));
  };
}

describe('createAccordion', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
  });

  test('creates closed accordion by default', () => {
    const { acc, header, body } = createAccordion(container, 'Title');
    expect(container.contains(acc)).toBe(true);
    expect(acc.classList.contains('wb-accordion')).toBe(true);
    expect(acc.classList.contains('wb-accordion-open')).toBe(false);
    expect(header.classList.contains('wb-accordion-header')).toBe(true);
    expect(body.style.display).toBe('none');
  });

  test('creates open accordion when defaultOpen true', () => {
    const { acc, header, body } = createAccordion(container, 'Open', true);
    expect(acc.classList.contains('wb-accordion-open')).toBe(true);
    expect(header.classList.contains('wb-accordion-open')).toBe(true);
    expect(body.style.display).toBe('');
  });

  test('toggles open/close on header click', () => {
    const { acc, header, body } = createAccordion(container, 'Toggle');
    header.click();
    expect(acc.classList.contains('wb-accordion-open')).toBe(true);
    expect(header.classList.contains('wb-accordion-open')).toBe(true);
    expect(body.style.display).toBe('');
    header.click();
    expect(acc.classList.contains('wb-accordion-open')).toBe(false);
    expect(header.classList.contains('wb-accordion-open')).toBe(false);
    expect(body.style.display).toBe('none');
  });

  test('ignores click on header child elements', () => {
    const { acc, header, body } = createAccordion(container, 'Child');
    const icon = header.querySelector('.wb-accordion-icon') as HTMLElement;
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(acc.classList.contains('wb-accordion-open')).toBe(false);
    expect(body.style.display).toBe('none');
  });
});
