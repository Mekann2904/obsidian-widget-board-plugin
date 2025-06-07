import { App } from 'obsidian';
import type { TweetWidgetPost } from '../tweetWidget/types';

function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function getLastNDays(n: number): string[] {
    const days: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        days.push(getDateKey(d));
    }
    return days;
}

export async function saveChartCache(app: App, posts: TweetWidgetPost[]): Promise<void> {
    const days = getLastNDays(7);
    const daySet = new Set(days);
    const countMap: Record<string, number> = {};
    for (const post of posts) {
        if ((post as any).deleted) continue;
        const d = getDateKey(new Date(post.created));
        if (daySet.has(d)) {
            countMap[d] = (countMap[d] || 0) + 1;
        }
    }
    const counts = days.map(d => countMap[d] || 0);
    const path = 'data.json';
    let data: any = {};
    try {
        const raw = await app.vault.adapter.read(path);
        data = JSON.parse(raw);
    } catch {}
    data.reflectionChartCache = { postCount: posts.length, days, counts };
    await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}

export async function loadChartCache(app: App): Promise<{postCount:number, days:string[], counts:number[]} | null> {
    const path = 'data.json';
    try {
        const raw = await app.vault.adapter.read(path);
        const data = JSON.parse(raw);
        if (data.reflectionChartCache) {
            return data.reflectionChartCache;
        }
    } catch {}
    return null;
}
