export function fragmentFromHTML(html: string): DocumentFragment {
    return document.createRange().createContextualFragment(html);
}

export function serializeHTML(el: HTMLElement): string {
    return new XMLSerializer().serializeToString(el);
}
