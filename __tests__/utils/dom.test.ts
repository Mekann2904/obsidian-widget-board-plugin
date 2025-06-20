import { fragmentFromHTML, serializeHTML } from '../../src/utils/dom';

describe('dom utilities', () => {
  test('fragmentFromHTML creates fragment', () => {
    const frag = fragmentFromHTML('<div class="a">hi</div><span>bye</span>');
    expect(frag.childNodes.length).toBe(2);
    const first = frag.firstChild as HTMLElement;
    expect(first.classList.contains('a')).toBe(true);
  });

  test('serializeHTML converts element to string', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>abc</span>';
    const html = serializeHTML(el);
    expect(html).toContain('<span>abc</span>');
  });
});
