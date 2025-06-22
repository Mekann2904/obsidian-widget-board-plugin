import type { WidgetConfig } from '../../interfaces';
import { App, Component } from 'obsidian';
import type WidgetBoardPlugin from '../../main';
import type { ReflectionWidget } from './reflectionWidget';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
import { TweetRepository } from '../tweetWidget';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { geminiSummaryPromptToday, geminiSummaryPromptWeek } from  '../../llm/gemini/summaryPrompts';
import { deobfuscate, getDateKey, getDateKeyLocal, getWeekRange } from '../../utils';
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import type { ReflectionWidgetPreloadBundle } from './reflectionWidget';
import { debugLog } from '../../utils/logger';
import { renderMermaidInWorker } from '../../utils';
import type ChartInstance from 'chart.js/auto';
import { t } from '../../i18n';
type ChartConstructor = new (ctx: CanvasRenderingContext2D, config: unknown) => ChartInstance;
// Chart.js型importはESM/CJS問題回避のためやめる

// --- Mermaid SVGメモリキャッシュ ---
const mermaidSvgCache = new Map<string, string>();
// --- まとめHTMLキャッシュ ---
const summaryHtmlCache = new Map<string, DocumentFragment>();
let Chart: ChartConstructor | undefined = undefined;
let chartModulePromise: Promise<ChartConstructor> | null = null;

export function preloadChartJS(): Promise<ChartConstructor> {
    if (!chartModulePromise) {
        chartModulePromise = import('chart.js/auto')
            .then(m => {
                Chart = m.default;
                return Chart;
            })
            .catch(e => {
                chartModulePromise = null;
                throw e;
            });
    }
    return chartModulePromise;
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
async function generateSummary(posts: TweetWidgetPost[], prompt: string, plugin: WidgetBoardPlugin): Promise<string> {
    if (!plugin.llmManager) return t(plugin.settings.language || 'ja', 'llmNotInitialized');
    const context = JSON.parse(JSON.stringify(plugin.settings.llm || {}));
    if (context.gemini && context.gemini.apiKey) {
        context.apiKey = deobfuscate(context.gemini.apiKey);
    }
    if (plugin.settings.reflectionAiModel) {
        context.model = plugin.settings.reflectionAiModel;
    }
    const text = posts.map(p => {
        const dateStr = getDateKeyLocal(new Date(p.created));
        return `[${dateStr}] ${p.text}`;
    }).join('\n');
    const promptText = prompt.replace('{posts}', text);
    debugLog(plugin, 'Gemini送信プロンプト:', promptText);
    debugLog(plugin, 'Gemini送信context:', context);
    try {
        const result = await plugin.llmManager.generateReplyWithDefault(promptText, context);
        debugLog(plugin, 'Gemini生成結果:', result);
        return result;
    } catch {
        return t(plugin.settings.language || 'ja', 'summaryFailed');
    }
}
async function saveReflectionSummary(
    type: 'today' | 'week',
    dateKey: string,
    summary: string,
    html: string,
    postCount: number,
    app: App
) {
    const path = 'data.json';
    let data: Record<string, unknown> = {};
    try {
        const raw = await app.vault.adapter.read(path);
        data = JSON.parse(raw);
    } catch {
        // ignore
    }
    const dataObj = data as { reflectionSummaries?: Record<string, unknown> };
    if (!dataObj.reflectionSummaries) dataObj.reflectionSummaries = {};
    dataObj.reflectionSummaries[type] = { date: dateKey, summary, html, postCount };
    await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    aiSummaryMemoryCache[`${type}:${dateKey}`] = Promise.resolve({
        summary,
        html,
        postCount
    });
}

// --- AI要約キャッシュのメモリ共有 ---
const aiSummaryMemoryCache: Record<string, Promise<{summary: string|null, html: string|null, postCount: number}>> = {};
// 元のloadReflectionSummary関数を復活
async function loadReflectionSummary(
    type: 'today' | 'week',
    dateKey: string,
    app: App
): Promise<{summary: string|null, html: string|null, postCount: number}> {
    const path = 'data.json';
    try {
        const raw = await app.vault.adapter.read(path);
        const data = JSON.parse(raw);
        if (data.reflectionSummaries && data.reflectionSummaries[type]?.date === dateKey) {
            return {
                summary: data.reflectionSummaries[type].summary ?? null,
                html: data.reflectionSummaries[type].html ?? null,
                postCount: data.reflectionSummaries[type].postCount ?? 0
            };
        }
    } catch {
        // ignore
    }
    return { summary: null, html: null, postCount: 0 };
}
export async function loadReflectionSummaryShared(
    type: 'today' | 'week',
    dateKey: string,
    app: App
): Promise<{summary: string|null, html: string|null, postCount: number}> {
    const key = `${type}:${dateKey}`;
    if (!aiSummaryMemoryCache[key]) {
        aiSummaryMemoryCache[key] = loadReflectionSummary(type, dateKey, app);
    }
    return aiSummaryMemoryCache[key];
}

export class ReflectionWidgetUI {
    private widget: ReflectionWidget;
    private container: HTMLElement;
    config: WidgetConfig;
    private app: App;
    private plugin: WidgetBoardPlugin;
    private autoTimer: ReturnType<typeof setInterval> | null = null;
    private chart: ChartInstance | null = null;
    private lastChartData: number[] | null = null;
    private lastTodaySummary: string | null = null;
    private lastWeekSummary: string | null = null;
    // 差分描画用の要素参照
    private contentEl: HTMLElement | null = null;
    private canvasEl: HTMLCanvasElement | null = null;
    private chartImgEl: HTMLImageElement | null = null;
    private todaySummaryEl: HTMLElement | null = null;
    private weekSummaryEl: HTMLElement | null = null;
    private aiSummarySectionEl: HTMLElement | null = null;
    private manualBtnEl: HTMLButtonElement | null = null;
    private needsRender = false;
    private preloadBundle?: ReflectionWidgetPreloadBundle;

    constructor(widget: ReflectionWidget, container: HTMLElement, config: WidgetConfig, app: App, plugin: WidgetBoardPlugin, preloadBundle?: ReflectionWidgetPreloadBundle) {
        this.widget = widget;
        this.container = container;
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        this.preloadBundle = preloadBundle;
    }

    public async render() {
        // Chart.jsの動的import（初回のみ）
        if (this.preloadBundle && this.preloadBundle.chartModule) {
            Chart = this.preloadBundle.chartModule as ChartConstructor;
        } else if (!Chart) {
            preloadChartJS(); // awaitしないでバックグラウンドでロード
        }
        // 初回のみ主要DOM生成
        if (!this.contentEl) {
            const parent = this.container.parentElement;
            if (parent) {
                const newContainer = this.container.cloneNode(false) as HTMLElement;
                parent.replaceChild(newContainer, this.container);
                this.container = newContainer;
            }
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            const title = document.createElement('div');
            title.className = 'widget-title';
            title.innerText = this.config.title || t(this.plugin.settings.language || 'ja', 'defaultTitle');
            this.container.appendChild(title);
            this.contentEl = document.createElement('div');
            this.contentEl.className = 'widget-content reflection-widget-content';
            this.container.appendChild(this.contentEl);
            const graphTitle = document.createElement('div');
            graphTitle.className = 'reflection-graph-title';
            graphTitle.innerText = t(this.plugin.settings.language || 'ja', 'trends7Days');
            this.contentEl.appendChild(graphTitle);
            this.canvasEl = document.createElement('canvas');
            this.canvasEl.width = 600;
            this.canvasEl.height = 220;
            this.canvasEl.className = 'reflection-canvas';
            this.contentEl.appendChild(this.canvasEl);
            this.chartImgEl = document.createElement('img');
            this.chartImgEl.className = 'reflection-chart-img';
            this.contentEl.appendChild(this.chartImgEl);
            this.aiSummarySectionEl = document.createElement('div');
            this.aiSummarySectionEl.className = 'reflection-ai-summary-section';
            this.contentEl.appendChild(this.aiSummarySectionEl);
            const todayTitle = document.createElement('div');
            todayTitle.className = 'reflection-summary-title';
            todayTitle.innerText = t(this.plugin.settings.language || 'ja', 'aiSummaryToday');
            this.aiSummarySectionEl.appendChild(todayTitle);
            this.todaySummaryEl = document.createElement('div');
            this.todaySummaryEl.className = 'reflection-summary-content';
            this.todaySummaryEl.innerText = '';
            this.aiSummarySectionEl.appendChild(this.todaySummaryEl);
            // --- 今日のまとめ コピー用ボタン追加 ---
            const todayCopyBtn = document.createElement('button');
            todayCopyBtn.className = 'reflection-copy-btn';
            todayCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copy');
            todayCopyBtn.onclick = async () => {
                const text = this.lastTodaySummary || '';
                try {
                    await navigator.clipboard.writeText(text);
                    const old = todayCopyBtn.innerText;
                    todayCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copied');
                    setTimeout(() => { todayCopyBtn.innerText = old; }, 1500);
                } catch {
                    todayCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copyFailed');
                    setTimeout(() => { todayCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copy'); }, 1500);
                }
            };
            todayTitle.appendChild(todayCopyBtn);
            const weekTitle = document.createElement('div');
            weekTitle.className = 'reflection-summary-title';
            weekTitle.innerText = t(this.plugin.settings.language || 'ja', 'aiSummaryWeek');
            this.aiSummarySectionEl.appendChild(weekTitle);
            this.weekSummaryEl = document.createElement('div');
            this.weekSummaryEl.className = 'reflection-summary-content';
            this.weekSummaryEl.innerText = '';
            this.aiSummarySectionEl.appendChild(this.weekSummaryEl);
            // --- 今週のまとめ コピー用ボタン追加 ---
            const weekCopyBtn = document.createElement('button');
            weekCopyBtn.className = 'reflection-copy-btn';
            weekCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copy');
            weekCopyBtn.onclick = async () => {
                const text = this.lastWeekSummary || '';
                try {
                    await navigator.clipboard.writeText(text);
                    const old = weekCopyBtn.innerText;
                    weekCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copied');
                    setTimeout(() => { weekCopyBtn.innerText = old; }, 1500);
                } catch {
                    weekCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copyFailed');
                    setTimeout(() => { weekCopyBtn.innerText = t(this.plugin.settings.language || 'ja', 'copy'); }, 1500);
                }
            };
            weekTitle.appendChild(weekCopyBtn);
            // --- 手動生成ボタン ---
            const settings = this.config.settings as ReflectionWidgetSettings;
            if (settings.aiSummaryManualEnabled) {
                const manualBtnContainer = document.createElement('div');
                manualBtnContainer.classList.add('manual-button-container');
                this.manualBtnEl = document.createElement('button');
                this.manualBtnEl.classList.add('manual-button');
                this.manualBtnEl.innerText = t(this.plugin.settings.language || 'ja', 'generateSummary');
                const trigger = () => this.runSummary(true);
                this.manualBtnEl.onclick = trigger;
                manualBtnContainer.appendChild(this.manualBtnEl);
                this.aiSummarySectionEl.appendChild(manualBtnContainer);
            }
        }
        // 差分描画: グラフ・要約のみ更新
        if (this.canvasEl && this.contentEl) {
            const parentWidth = this.contentEl.clientWidth;
            if (parentWidth > 0) {
                this.canvasEl.width = parentWidth;
            }
        }
        // --- ここから即時キャッシュ表示処理を追加（プリロードバンドル対応） ---
        if (this.preloadBundle && this.todaySummaryEl && this.weekSummaryEl) {
            if (this.preloadBundle.todaySummary.html) {
                const frag = document.createRange().createContextualFragment(this.preloadBundle.todaySummary.html);
                this.todaySummaryEl.empty();
                this.todaySummaryEl.appendChild(frag);
            } else {
                this.todaySummaryEl.innerText = this.preloadBundle.todaySummary.summary || t(this.plugin.settings.language || 'ja', 'noPostsToday');
            }
            if (this.preloadBundle.weekSummary.html) {
                const frag = document.createRange().createContextualFragment(this.preloadBundle.weekSummary.html);
                this.weekSummaryEl.empty();
                this.weekSummaryEl.appendChild(frag);
            } else {
                this.weekSummaryEl.innerText = this.preloadBundle.weekSummary.summary || t(this.plugin.settings.language || 'ja', 'noPostsThisWeek');
            }
        } else {
            const todayKey = getDateKeyLocal(new Date());
            const [, weekEnd] = getWeekRange(this.plugin.settings.weekStartDay);
            const weekKey = getDateKeyLocal(new Date(weekEnd));
            Promise.all([
                loadReflectionSummaryShared('today', todayKey, this.app),
                loadReflectionSummaryShared('week', weekKey, this.app)
            ]).then(([cachedToday, cachedWeek]) => {
                if (this.todaySummaryEl) {
                    if (cachedToday.html) {
                        const frag = document.createRange().createContextualFragment(cachedToday.html);
                        this.todaySummaryEl.empty();
                        this.todaySummaryEl.appendChild(frag);
                    } else {
                        this.todaySummaryEl.innerText = cachedToday.summary || t(this.plugin.settings.language || 'ja', 'noPostsToday');
                    }
                }
                if (this.weekSummaryEl) {
                    if (cachedWeek.html) {
                        const frag = document.createRange().createContextualFragment(cachedWeek.html);
                        this.weekSummaryEl.empty();
                        this.weekSummaryEl.appendChild(frag);
                    } else {
                        this.weekSummaryEl.innerText = cachedWeek.summary || t(this.plugin.settings.language || 'ja', 'noPostsThisWeek');
                    }
                }
            });
        }
        // --- ここまで ---
        setTimeout(() => this.updateGraphAndSummaries(), 0);
    }

    private async runSummary(force = false) {
        this.clearAllCaches();
        // 実行中フラグ
        if (this.manualBtnEl) {
            this.manualBtnEl.disabled = true;
            this.manualBtnEl.innerText = t(this.plugin.settings.language || 'ja', 'generating');
        }
        let timeoutOccured = false;
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
                timeoutOccured = true;
                reject(new Error('タイムアウトしました'));
            }, 600000)); // 10分
            await Promise.race([
                (async () => {
                    const todayKey = getDateKeyLocal(new Date());
                    const [weekStart, weekEnd] = getWeekRange(this.plugin.settings.weekStartDay);
                    const weekKey = getDateKeyLocal(new Date(weekEnd));
                    // 投稿データ読み込みを先行して開始
                    const dbPath = this.plugin.settings.baseFolder
                        ? `${this.plugin.settings.baseFolder.replace(/\/$/, '')}/tweets.json`
                        : 'tweets.json';
                    const repo = new TweetRepository(this.app, dbPath);
                    const postsPromise = repo.load(this.plugin.settings.language || 'ja').then((s: TweetWidgetSettings) => s.posts || []);
                    // キャッシュ取得
                    const [cachedToday, cachedWeek] = await Promise.all([
                        loadReflectionSummaryShared('today', todayKey, this.app),
                        loadReflectionSummaryShared('week', weekKey, this.app)
                    ]);
                    // キャッシュ済み要約があれば再レンダリングをスキップ
                    let todaySummaryRendered = false;
                    let weekSummaryRendered = false;
                    if (cachedToday.summary && this.lastTodaySummary === cachedToday.summary) {
                        todaySummaryRendered = true;
                    }
                    if (cachedWeek.summary && this.lastWeekSummary === cachedWeek.summary) {
                        weekSummaryRendered = true;
                    }
                    // MarkdownRendererの呼び出しも内容が変わったときだけ
                    const renderMdTasks = [];
                    if (!todaySummaryRendered && this.todaySummaryEl) {
                        renderMdTasks.push(this.renderMarkdown(this.todaySummaryEl, cachedToday.summary || t(this.plugin.settings.language || 'ja', 'noPostsToday'), this.lastTodaySummary, v => this.lastTodaySummary = v));
                    }
                    if (!weekSummaryRendered && this.weekSummaryEl) {
                        renderMdTasks.push(this.renderMarkdown(this.weekSummaryEl, cachedWeek.summary || t(this.plugin.settings.language || 'ja', 'noPostsThisWeek'), this.lastWeekSummary, v => this.lastWeekSummary = v));
                    }
                    await Promise.all(renderMdTasks);
                    // 投稿データ読み込み完了を待つ
                    const posts: TweetWidgetPost[] = await postsPromise;
                    // --- ここからAI要約生成（強制再生成 or キャッシュなし時） ---
                    // ユーザプロンプトがあればそれを優先
                    const userPromptToday = this.plugin.settings.userSummaryPromptToday;
                    const userPromptWeek = this.plugin.settings.userSummaryPromptWeek;
                    if (force || !cachedToday.summary) {
                        const todayPosts = posts.filter(p => !p.deleted && getDateKeyLocal(new Date(p.created)) === todayKey && p.userId === '@you');
                        const todayPrompt = userPromptToday && userPromptToday.trim() ? userPromptToday : geminiSummaryPromptToday;
                        const todayText = todayPosts.length > 0 ? await generateSummary(todayPosts, todayPrompt, this.plugin) : '';
                        const todayHtml = await this.renderMarkdown(this.todaySummaryEl!, todayText || t(this.plugin.settings.language || 'ja', 'noPostsToday'), this.lastTodaySummary, v => this.lastTodaySummary = v);
                        await saveReflectionSummary(
                            'today',
                            todayKey,
                            todayText,
                            todayHtml,
                            todayPosts.length,
                            this.app
                        );
                    }
                    if (force || !cachedWeek.summary) {
                        const weekPosts = posts.filter(p => !p.deleted && getDateKeyLocal(new Date(p.created)) >= weekStart && getDateKeyLocal(new Date(p.created)) <= weekKey && p.userId === '@you');
                        const weekPrompt = userPromptWeek && userPromptWeek.trim() ? userPromptWeek : geminiSummaryPromptWeek;
                        const weekText = weekPosts.length > 0 ? await generateSummary(weekPosts, weekPrompt, this.plugin) : '';
                        const weekHtml = await this.renderMarkdown(this.weekSummaryEl!, weekText || t(this.plugin.settings.language || 'ja', 'noPostsThisWeek'), this.lastWeekSummary, v => this.lastWeekSummary = v);
                        await saveReflectionSummary(
                            'week',
                            weekKey,
                            weekText,
                            weekHtml,
                            weekPosts.length,
                            this.app
                        );
                    }
                    // グラフデータ取得・描画
                    const days = getLastNDays(7);
                    const counts = this.plugin.getTweetPostCounts(days);
                    const key = counts.join(',');
                    if (!this.plugin.tweetChartDirty && this.plugin.tweetChartImageData && this.plugin.tweetChartCountsKey === key) {
                        if (this.chartImgEl) {
                            this.chartImgEl.src = this.plugin.tweetChartImageData;
                            this.chartImgEl.style.display = 'block';
                        }
                        if (this.canvasEl) this.canvasEl.style.display = 'none';
                        this.lastChartData = [...counts];
                    } else if (this.canvasEl) {
                        if (this.chart) {
                            this.chart.destroy();
                            this.chart = null;
                        }
                        this.canvasEl.style.display = 'block';
                        if (this.chartImgEl) this.chartImgEl.style.display = 'none';
                        const ctx = this.canvasEl.getContext('2d');
                        if (ctx) {
            const style = getComputedStyle(document.documentElement);
            const lineColor = style.getPropertyValue("--tweet-chart-line-color").trim() || "#4a90e2";
            const fillColor = style.getPropertyValue("--tweet-chart-fill-color").trim() || "rgba(74,144,226,0.15)";
            const gridColor = style.getPropertyValue("--tweet-chart-grid-color").trim() || "#eee";
                            if (Chart) {
                                this.chart = new Chart(ctx, {
                                    type: 'line',
                                    data: {
                                        labels: days.map(d => d.slice(5)),
                                        datasets: [{
                                            label: '投稿数',
                                            data: counts,
                                            borderColor: lineColor,
                                            backgroundColor: fillColor,
                                            fill: true,
                                            tension: 0.3,
                                            pointRadius: 3,
                                        }]
                                    },
                                    options: {
                                        responsive: false,
                                        animation: false,
                                        plugins: { legend: { display: false } },
                                        scales: {
                                            x: {
                                                grid: { display: false },
                                                ticks: { maxTicksLimit: 5 }
                                            },
                                            y: { beginAtZero: true, grid: { color: gridColor } }
                                        }
                                    }
                                });
                            }
                            await new Promise(r => requestAnimationFrame(r));
                            this.plugin.tweetChartImageData = this.canvasEl.toDataURL();
                            this.plugin.tweetChartCountsKey = key;
                            this.plugin.tweetChartDirty = false;
                        }
                        this.lastChartData = [...counts];
                    }
                })(),
                timeoutPromise
            ]);
        } catch {
            if (this.manualBtnEl) {
                this.manualBtnEl.innerText = timeoutOccured ? t(this.plugin.settings.language || 'ja', 'timeout') : t(this.plugin.settings.language || 'ja', 'generationFailed');
                setTimeout(() => {
                    this.manualBtnEl!.innerText = t(this.plugin.settings.language || 'ja', 'generateSummary');
                    this.manualBtnEl!.disabled = false;
                }, 3000);
                return;
            }
        }
        if (this.manualBtnEl) {
            this.manualBtnEl.innerText = t(this.plugin.settings.language || 'ja', 'generationComplete');
            this.manualBtnEl.disabled = false;
        }
    }

    private async renderMarkdown(el: HTMLElement, text: string, lastText: string | null, setLast: (v: string) => void): Promise<string> {
        if (text === lastText) return '';
        el.empty();
        await renderMarkdownBatchWithCache(text, el, '', new Component());
        setLast(text);
        // --- MermaidブロックをWorkerでSVG化して差し替え ---
        await this.replaceMermaidBlocksWithSVG(el);
        return new XMLSerializer().serializeToString(el);
    }

    // Markdownレンダリング結果をキャッシュして返す
    private async renderMarkdownWithCache(el: HTMLElement, text: string, cacheKey: string) {
        if (summaryHtmlCache.has(cacheKey)) {
            el.empty();
            el.appendChild(summaryHtmlCache.get(cacheKey)!.cloneNode(true));
            return;
        }
        el.empty();
        await renderMarkdownBatchWithCache(text, el, '', new Component());
        const frag = document.createDocumentFragment();
        for (const node of Array.from(el.childNodes)) {
            frag.appendChild(node.cloneNode(true));
        }
        summaryHtmlCache.set(cacheKey, frag);
    }

    // MermaidブロックをWorkerでSVG化して差し替える（キャッシュ利用）
    private async replaceMermaidBlocksWithSVG(container: HTMLElement) {
        const codeBlocks = Array.from(container.querySelectorAll('pre > code.language-mermaid')) as HTMLElement[];
        for (const codeEl of codeBlocks) {
            const pre = codeEl.parentElement;
            if (!pre) continue;
            const code = codeEl.innerText;
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
            // キャッシュ利用
            if (mermaidSvgCache.has(code)) {
                const svg = mermaidSvgCache.get(code)!;
                const wrapper = document.createElement('div');
                const frag = document.createRange().createContextualFragment(svg);
                wrapper.appendChild(frag);
                pre.replaceWith(wrapper);
                continue;
            }
            try {
                const svg = await renderMermaidInWorker(code, id);
                mermaidSvgCache.set(code, svg);
                const wrapper = document.createElement('div');
                const frag = document.createRange().createContextualFragment(svg);
                wrapper.appendChild(frag);
                pre.replaceWith(wrapper);
            } catch {
                // エラー時はそのまま
            }
        }
    }

    private updateGraphAndSummaries() {
        const settings: ReflectionWidgetSettings = this.config.settings || {};
        const autoEnabled = settings.aiSummaryAutoEnabled ?? false;
        const autoInterval = typeof settings.aiSummaryAutoIntervalHours === 'number' ? settings.aiSummaryAutoIntervalHours : -1;
        const manualEnabled = settings.aiSummaryManualEnabled ?? true;
        // 手動発火ボタン（初回のみ生成）
        if (manualEnabled && this.aiSummarySectionEl && !this.manualBtnEl) {
            this.manualBtnEl = document.createElement('button');
            this.manualBtnEl.classList.add('manual-button');
            this.manualBtnEl.innerText = t(this.plugin.settings.language || 'ja', 'generateSummary');
            this.manualBtnEl.onclick = async () => {
                this.manualBtnEl!.disabled = true;
                this.manualBtnEl!.innerText = t(this.plugin.settings.language || 'ja', 'generating');
                const trigger = () => this.runSummary(true);
                if ('requestIdleCallback' in window) {
                    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(trigger);
                } else {
                    setTimeout(trigger, 0);
                }
            };
            this.aiSummarySectionEl.appendChild(this.manualBtnEl);
        }
        // 自動発火タイマー
        if (autoEnabled && autoInterval > 0) {
            if (this.autoTimer) clearInterval(this.autoTimer);
            this.autoTimer = setInterval(() => {
                if ('requestIdleCallback' in window) {
                    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => this.runSummary());
                } else {
                    requestAnimationFrame(() => this.runSummary());
                }
            }, autoInterval * 60 * 60 * 1000);
            if ('requestIdleCallback' in window) {
                (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => this.runSummary());
            } else {
                requestAnimationFrame(() => this.runSummary());
            }
        } else {
            if ('requestIdleCallback' in window) {
                (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => this.runSummary());
            } else {
                requestAnimationFrame(() => this.runSummary());
            }
        }
    }

    public scheduleRender(): void {
        if (this.needsRender) return;
        this.needsRender = true;
        requestAnimationFrame(() => {
            this.render();
            this.needsRender = false;
        });
    }

    public onunload(): void {
        // Chart.jsインスタンスの破棄
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        // タイマーの解除
        if (this.autoTimer) {
            clearInterval(this.autoTimer);
            this.autoTimer = null;
        }
        // DOM参照のクリア
        this.contentEl = null;
        this.canvasEl = null;
        this.chartImgEl = null;
        this.todaySummaryEl = null;
        this.weekSummaryEl = null;
        this.aiSummarySectionEl = null;
        this.manualBtnEl = null;
    }

    // 振り返りAI生成時にキャッシュクリア
    private clearAllCaches() {
        mermaidSvgCache.clear();
        summaryHtmlCache.clear();
    }
} 