// src/prewarm.ts
import { Notice, App, Component, TFile } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { TweetRepository } from './widgets/tweetWidget';
import { MemoWidgetSettings } from './widgets/memo';
import { FileViewWidgetSettings } from './widgets/file-view';
import { renderMarkdownBatchWithCache } from './utils/renderMarkdownBatch';
import { getDateKey, getWeekRange } from './utils';
import { t } from './i18n';

export class PrewarmManager {
    tweetPostCountCache: Record<string, number> = {};

    constructor(private plugin: WidgetBoardPlugin) {}

    private get app(): App {
        return this.plugin.app;
    }

    async initTweetPostCountCache() {
        const dbPath = this.plugin.settings.baseFolder
            ? `${this.plugin.settings.baseFolder.replace(/\/$/, '')}/tweets.json`
            : 'tweets.json';
        const repo = new TweetRepository(this.app, dbPath);
        const tweetSettings = await repo.load(this.plugin.settings.language || 'ja');
        this.tweetPostCountCache = {};
        for (const p of tweetSettings.posts || []) {
            if (p.deleted) continue;
            const key = getDateKey(new Date(p.created));
            this.tweetPostCountCache[key] = (this.tweetPostCountCache[key] || 0) + 1;
        }
    }

    updateTweetPostCount(created: number, delta: number) {
        const key = getDateKey(new Date(created));
        this.tweetPostCountCache[key] = (this.tweetPostCountCache[key] || 0) + delta;
        if (this.tweetPostCountCache[key] <= 0) {
            delete this.tweetPostCountCache[key];
        }
        this.plugin.tweetChartDirty = true;
    }

    getTweetPostCounts(days: string[]): number[] {
        return days.map(d => this.tweetPostCountCache[d] || 0);
    }

    async prewarmAllWidgetMarkdownCache() {
        const MAX_PREWARM_ENTRIES = 50;
        const lang = this.plugin.settings.language || 'ja';
        try {
            new Notice(t(lang, 'prewarm.caching'));
            const dbPath = this.plugin.settings.baseFolder
                ? `${this.plugin.settings.baseFolder.replace(/\/$/, '')}/tweets.json`
                : 'tweets.json';
            const repo = new TweetRepository(this.app, dbPath);
            const tweetSettings = await repo.load(this.plugin.settings.language || 'ja');
            const tweetPosts = (tweetSettings.posts || []).slice(0, MAX_PREWARM_ENTRIES);

            const memoContents: string[] = [];
            const fileViewFiles: string[] = [];
            for (const board of this.plugin.settings.boards) {
                for (const widget of board.widgets) {
                    if (widget.type === 'memo') {
                        const settings = widget.settings as MemoWidgetSettings;
                        if (settings?.memoContent) {
                            memoContents.push(settings.memoContent);
                        }
                    }
                    if (widget.type === 'file-view-widget') {
                        const settings = widget.settings as FileViewWidgetSettings;
                        if (settings?.fileName) {
                            fileViewFiles.push(settings.fileName);
                        }
                    }
                }
            }
            memoContents.splice(MAX_PREWARM_ENTRIES);
            fileViewFiles.splice(MAX_PREWARM_ENTRIES);

            async function loadReflectionSummary(type: 'today' | 'week', dateKey: string, app: App): Promise<string | null> {
                const path = 'data.json';
                try {
                    const raw = await app.vault.adapter.read(path);
                    const data = JSON.parse(raw);
                    if (data.reflectionSummaries && data.reflectionSummaries[type]?.date === dateKey) {
                        return data.reflectionSummaries[type].summary;
                    }
                } catch {
                }
                return null;
            }
            const todayKey = getDateKey(new Date());
            const [, weekEnd] = getWeekRange(this.plugin.settings.weekStartDay);
            const weekKey = weekEnd;
            const todaySummary = await loadReflectionSummary('today', todayKey, this.app);
            const weekSummary = await loadReflectionSummary('week', weekKey, this.app);

            let tweetIndex = 0, memoIndex = 0, fileIndex = 0;
            let reflectionIndex = 0;
            const reflectionSummaries = [todaySummary, weekSummary].filter(Boolean).slice(0, MAX_PREWARM_ENTRIES) as string[];
            const batchSize = 3;
            const schedule = (cb: () => void) => {
                const w = window as Window & {
                    requestIdleCallback?: (callback: IdleRequestCallback) => number;
                };
                if (typeof w.requestIdleCallback === 'function') {
                    w.requestIdleCallback(cb);
                } else {
                    requestAnimationFrame(cb);
                }
            };
            const processBatch = async () => {
                const tweetEnd = Math.min(tweetIndex + batchSize, tweetPosts.length);
                for (; tweetIndex < tweetEnd; tweetIndex++) {
                    const post = tweetPosts[tweetIndex];
                    await renderMarkdownBatchWithCache(post.text, document.createElement('div'), '', new Component());
                }
                const memoEnd = Math.min(memoIndex + batchSize, memoContents.length);
                for (; memoIndex < memoEnd; memoIndex++) {
                    await renderMarkdownBatchWithCache(memoContents[memoIndex], document.createElement('div'), '', new Component());
                }
                const fileEnd = Math.min(fileIndex + batchSize, fileViewFiles.length);
                for (; fileIndex < fileEnd; fileIndex++) {
                    const file = this.app.vault.getAbstractFileByPath(fileViewFiles[fileIndex]);
                    if (file && file instanceof TFile) {
                        const content = await this.app.vault.read(file);
                        await renderMarkdownBatchWithCache(content, document.createElement('div'), file.path, new Component());
                    }
                }
                const reflectionEnd = Math.min(reflectionIndex + batchSize, reflectionSummaries.length);
                for (; reflectionIndex < reflectionEnd; reflectionIndex++) {
                    await renderMarkdownBatchWithCache(reflectionSummaries[reflectionIndex], document.createElement('div'), '', new Component());
                }
                if (
                    tweetIndex < tweetPosts.length ||
                    memoIndex < memoContents.length ||
                    fileIndex < fileViewFiles.length ||
                    reflectionIndex < reflectionSummaries.length
                ) {
                    schedule(processBatch);
                } else {
                    new Notice(t(lang, 'prewarm.cacheComplete'));
                }
            };
            schedule(processBatch);
        } catch (e) {
            console.error(t(lang, 'prewarm.error'), e);
        }
    }
}
