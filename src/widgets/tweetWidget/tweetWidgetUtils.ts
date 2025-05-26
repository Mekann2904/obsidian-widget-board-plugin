export function parseTags(text: string): string[] {
    const regex = /#([\w-]+)/g;
    return (text.match(regex) || []).map(tag => tag.substring(1));
}

export function parseLinks(text: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const matches = text.matchAll(regex);
    return Array.from(matches, m => m[1]);
}

export function formatTimeAgo(time: number): string {
    const now = Date.now();
    const diff = Math.floor((now - time) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    const d = new Date(time);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function wrapSelection(input: HTMLTextAreaElement, wrapper: string) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    const selectedText = value.substring(start, end);
    const replacement = wrapper + selectedText + wrapper;
    input.value = value.substring(0, start) + replacement + value.substring(end);
    input.selectionStart = start + wrapper.length;
    input.selectionEnd = end + wrapper.length;
    input.focus();
} 