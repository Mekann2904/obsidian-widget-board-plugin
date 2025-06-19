export interface ScheduleOptions {
    hour: number;
    minute: number;
    daysOfWeek?: number[];
    startDate?: string;
    endDate?: string;
}

export function computeNextTime(opts: ScheduleOptions, from: Date = new Date()): number | null {
    const start = opts.startDate ? new Date(opts.startDate) : null;
    const end = opts.endDate ? new Date(opts.endDate) : null;
    let base = new Date(from.getTime());
    if (start && base < start) base = new Date(start.getTime());
    // use UTC timestamps to avoid timezone differences
    for (let i = 0; i < 366; i++) {
        const d = new Date(Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth(),
            base.getUTCDate() + i,
            opts.hour,
            opts.minute,
            0,
            0,
        ));
        if (d <= from) continue;
        if (start && d < start) continue;
        if (end && d > end) return null;
        if (opts.daysOfWeek && opts.daysOfWeek.length > 0 && !opts.daysOfWeek.includes(d.getDay())) {
            continue;
        }
        return d.getTime();
    }
    return null;
}
