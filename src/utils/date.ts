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

export function getWeekRange(weekStartDay: number = 0): [string, string] {
    const now = new Date();
    const currentDay = now.getDay();
    const offsetToStart = (currentDay - weekStartDay + 7) % 7;
    const offsetToEnd = 6 - offsetToStart;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetToStart);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToEnd);
    return [getDateKey(start), getDateKey(end)];
}
