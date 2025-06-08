export function pad2(n: number): string {
    return n.toString().padStart(2, '0');
}

export function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function getDateKeyLocal(date: Date): string {
    return [
        date.getFullYear(),
        pad2(date.getMonth() + 1),
        pad2(date.getDate())
    ].join('-');
}

export function getWeekRange(): [string, string] {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
    return [getDateKey(start), getDateKey(end)];
}
