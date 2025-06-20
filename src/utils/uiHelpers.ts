// UI共通ヘルパー
export function createAccordion(
  containerEl: HTMLElement,
  title: string,
  defaultOpen: boolean = false
): { acc: HTMLElement; header: HTMLElement; body: HTMLElement } {
  const acc = containerEl.createDiv({ cls: 'wb-accordion' + (defaultOpen ? ' wb-accordion-open' : '') });
  const header = acc.createDiv({ cls: 'wb-accordion-header' });
  const icon = header.createSpan({ cls: 'wb-accordion-icon' });
  icon.setText('▶');
  header.appendText(title);
  const body = acc.createDiv({ cls: 'wb-accordion-body' });

  if (defaultOpen) {
    header.addClass('wb-accordion-open');
    // icon.setText('▼'); // アイコンを開いた状態にする場合
  } else {
    body.style.display = 'none'; // 初期状態で閉じていればbodyも非表示
  }

  header.addEventListener('click', (event) => {
    // ヘッダー自身がクリックされた場合のみ開閉
    if (event.currentTarget !== event.target) return;
    const isOpen = acc.classList.toggle('wb-accordion-open');
    header.classList.toggle('wb-accordion-open');
    // icon.setText(isOpen ? '▼' : '▶'); // アイコン切り替え
    body.style.display = isOpen ? '' : 'none';
  });
  return { acc, header, body };
} 