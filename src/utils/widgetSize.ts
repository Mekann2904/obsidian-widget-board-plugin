import type { WidgetConfig } from '../interfaces';

export function applyWidgetSize(
    widgetEl: HTMLElement,
    settings: { width?: string; height?: string } | null
): void {
    if (!widgetEl || !settings) return;
    if (settings.width) widgetEl.style.width = settings.width;
    if (settings.height) widgetEl.style.height = settings.height;
}

export function createWidgetContainer(
    config: WidgetConfig,
    classes: string[] | string,
    withTitle: boolean = true
): { widgetEl: HTMLElement; titleEl?: HTMLElement } {
    const widgetEl = document.createElement('div');
    const classList = Array.isArray(classes) ? classes : [classes];
    widgetEl.classList.add('widget', ...classList);
    widgetEl.setAttribute('data-widget-id', config.id);
    let titleEl: HTMLElement | undefined;
    if (withTitle) {
        titleEl = widgetEl.createDiv({ cls: 'widget-title' });
        titleEl.textContent = config.title?.trim() || '';
    }

    return { widgetEl, titleEl };
}
