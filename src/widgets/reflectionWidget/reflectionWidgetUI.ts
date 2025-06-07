import type { WidgetConfig } from '../../interfaces';
import { App, MarkdownRenderer, Component } from 'obsidian';
import type { ReflectionWidget } from './reflectionWidget';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
import { TweetRepository } from '../tweetWidget/TweetRepository';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { geminiSummaryPromptToday, geminiSummaryPromptWeek } from  '../../llm/gemini/summaryPrompts';
import { deobfuscate } from '../../utils';
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';

let Chart: any;
let chartModulePromise: Promise<any> | null = null;

export function preloadChartJS(): Promise<any> {
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

function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}
function getDateKeyLocal(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
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
function getWeekRange(): [string, string] {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
    return [getDateKey(start), getDateKey(end)];
}
async function generateSummary(posts: TweetWidgetPost[], prompt: string, plugin: any): Promise<string> {
    if (!plugin.llmManager) return 'LLM未初期化';
    const context = JSON.parse(JSON.stringify(plugin.settings.llm || {}));
    if (context.gemini && context.gemini.apiKey) {
        context.apiKey = deobfuscate(context.gemini.apiKey);
    }
    const text = posts.map(p => {
        const dateStr = getDateKeyLocal(new Date(p.created));
        return `[${dateStr}] ${p.text}`;
    }).join('\n');
    const promptText = prompt.replace('{posts}', text);
    try {
        const result = await plugin.llmManager.generateReplyWithDefault(promptText, context);
        return result;
    } catch (e) {
        return '要約生成に失敗しました';
    }
}
async function saveReflectionSummary(type: 'today' | 'week', dateKey: string, summary: string, app: App) {
    const path = 'data.json';
    let data: any = {};
    try {
        const raw = await app.vault.adapter.read(path);
        data = JSON.parse(raw);
    } catch {}
    if (!data.reflectionSummaries) data.reflectionSummaries = {};
    data.reflectionSummaries[type] = { date: dateKey, summary };
    await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}
async function loadReflectionSummary(type: 'today' | 'week', dateKey: string, app: App): Promise<string | null> {
    const path = 'data.json';
    try {
        const raw = await app.vault.adapter.read(path);
        const data = JSON.parse(raw);
        if (data.reflectionSummaries && data.reflectionSummaries[type]?.date === dateKey) {
            return data.reflectionSummaries[type].summary;
        }
    } catch {}
    return null;
}

export class ReflectionWidgetUI {
    private widget: ReflectionWidget;
    private container: HTMLElement;
    private config: WidgetConfig;
    private app: App;
    private plugin: any;
    private autoTimer: any = null;
    private chart: any | null = null;
    private lastChartData: number[] | null = null;
    private lastTodaySummary: string | null = null;
    private lastWeekSummary: string | null = null;
    // 差分描画用の要素参照
    private contentEl: HTMLElement | null = null;
    private canvasEl: HTMLCanvasElement | null = null;
    private todaySummaryEl: HTMLElement | null = null;
    private weekSummaryEl: HTMLElement | null = null;
    private aiSummarySectionEl: HTMLElement | null = null;
    private manualBtnEl: HTMLButtonElement | null = null;
    private needsRender = false;

    constructor(widget: ReflectionWidget, container: HTMLElement, config: WidgetConfig, app: App, plugin: any) {
        this.widget = widget;
        this.container = container;
        this.config = config;
        this.app = app;
        this.plugin = plugin;
    }

    public async render() {
        // Chart.jsの動的import（初回のみ）
        if (!Chart) {
            await preloadChartJS();
        }
        // 初回のみ主要DOM生成
        if (!this.contentEl) {
            const parent = this.container.parentElement;
            if (parent) {
                const newContainer = this.container.cloneNode(false) as HTMLElement;
                parent.replaceChild(newContainer, this.container);
                this.container = newContainer;
            }
            // Chart.jsのインスタンスがあれば破棄
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            const settings: ReflectionWidgetSettings = this.config.settings || {};
            // タイトル
            const title = document.createElement('div');
            title.className = 'widget-title';
            title.innerText = this.config.title || '振り返りレポート';
            this.container.appendChild(title);
            // コンテンツ
            this.contentEl = document.createElement('div');
            this.contentEl.className = 'widget-content';
            this.contentEl.style.display = 'flex';
            this.contentEl.style.flexDirection = 'column';
            this.contentEl.style.alignItems = 'center';
            this.contentEl.style.justifyContent = 'center';
            this.contentEl.style.padding = '8px 0 0 0';
            // CSS containmentを追加
            this.contentEl.style.contain = 'layout style';
            this.container.appendChild(this.contentEl);
            // グラフタイトル
            const graphTitle = document.createElement('div');
            graphTitle.style.fontWeight = 'bold';
            graphTitle.style.marginBottom = '4px';
            graphTitle.style.textAlign = 'center';
            graphTitle.style.fontSize = '1em';
            graphTitle.innerText = '直近7日間の投稿数トレンド';
            this.contentEl.appendChild(graphTitle);
            // グラフcanvas
            this.canvasEl = document.createElement('canvas');
            this.canvasEl.width = 600;
            this.canvasEl.height = 220;
            this.canvasEl.style.margin = '0 auto 16px auto';
            this.canvasEl.style.display = 'block';
            this.canvasEl.style.maxWidth = '80%';
            this.canvasEl.style.width = '80%';
            this.contentEl.appendChild(this.canvasEl);
            // AIまとめセクション
            this.aiSummarySectionEl = document.createElement('div');
            this.aiSummarySectionEl.style.width = '100%';
            this.aiSummarySectionEl.style.marginTop = '18px';
            this.aiSummarySectionEl.style.padding = '8px 0 0 0';
            this.aiSummarySectionEl.style.borderTop = '1px solid var(--divider-color, #444)';
            this.contentEl.appendChild(this.aiSummarySectionEl);
            // 今日・今週のまとめタイトル
            const todayTitle = document.createElement('div');
            todayTitle.style.fontWeight = 'bold';
            todayTitle.style.margin = '16px 0 2px 0';
            todayTitle.style.fontSize = '2em';
            todayTitle.innerText = 'AIによる今日のまとめ';
            this.aiSummarySectionEl.appendChild(todayTitle);
            this.todaySummaryEl = document.createElement('div');
            this.todaySummaryEl.innerText = '';
            this.todaySummaryEl.style.minHeight = '2em';
            this.aiSummarySectionEl.appendChild(this.todaySummaryEl);
            const weekTitle = document.createElement('div');
            weekTitle.style.fontWeight = 'bold';
            weekTitle.style.margin = '16px 0 2px 0';
            weekTitle.style.fontSize = '2em';
            weekTitle.innerText = 'AIによる今週のまとめ';
            this.aiSummarySectionEl.appendChild(weekTitle);
            this.weekSummaryEl = document.createElement('div');
            this.weekSummaryEl.innerText = '';
            this.weekSummaryEl.style.minHeight = '2em';
            this.aiSummarySectionEl.appendChild(this.weekSummaryEl);
        }
        // 差分描画: グラフ・要約のみ更新
        if (this.canvasEl && this.contentEl) {
            const parentWidth = this.contentEl.clientWidth;
            if (parentWidth > 0) {
                this.canvasEl.width = parentWidth;
            }
        }
        this.updateGraphAndSummaries();
    }

    private async runSummary(force = false) {
        // 実行中フラグ
        if (this.manualBtnEl) {
            this.manualBtnEl.disabled = true;
            this.manualBtnEl.innerText = '実行中...';
        }
        let timeoutOccured = false;
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
                timeoutOccured = true;
                reject(new Error('タイムアウトしました'));
            }, 60000)); // 60秒
            await Promise.race([
                (async () => {
                    const settings: ReflectionWidgetSettings = this.config.settings || {};
                    const todayKey = getDateKeyLocal(new Date());
                    const [weekStart, weekEnd] = getWeekRange();
                    const weekKey = getDateKeyLocal(new Date(weekEnd));
                    // キャッシュ取得を並列化
                    const [cachedToday, cachedWeek] = await Promise.all([
                        loadReflectionSummary('today', todayKey, this.app),
                        loadReflectionSummary('week', weekKey, this.app)
                    ]);
                    // 投稿データ取得（グラフ描画と共通化）
                    const dbPath = this.plugin.settings.baseFolder
                        ? `${this.plugin.settings.baseFolder.replace(/\/$/, '')}/tweets.json`
                        : 'tweets.json';
                    const repo = new TweetRepository(this.app, dbPath);
                    const tweetSettings: TweetWidgetSettings = await repo.load();
                    const posts: TweetWidgetPost[] = tweetSettings.posts || [];
                    // キャッシュ済み要約があれば再レンダリングをスキップ
                    let todaySummaryRendered = false;
                    let weekSummaryRendered = false;
                    if (cachedToday && this.lastTodaySummary === cachedToday) {
                        todaySummaryRendered = true;
                    }
                    if (cachedWeek && this.lastWeekSummary === cachedWeek) {
                        weekSummaryRendered = true;
                    }
                    // MarkdownRendererの呼び出しも内容が変わったときだけ
                    const renderMdTasks = [];
                    if (!todaySummaryRendered && this.todaySummaryEl) {
                        renderMdTasks.push(this.renderMarkdown(this.todaySummaryEl, cachedToday || '本日の投稿がありません。', this.lastTodaySummary, v => this.lastTodaySummary = v));
                    }
                    if (!weekSummaryRendered && this.weekSummaryEl) {
                        renderMdTasks.push(this.renderMarkdown(this.weekSummaryEl, cachedWeek || '今週の投稿がありません。', this.lastWeekSummary, v => this.lastWeekSummary = v));
                    }
                    await Promise.all(renderMdTasks);
                    // --- ここからAI要約生成（強制再生成 or キャッシュなし時） ---
                    // ユーザプロンプトがあればそれを優先
                    const userPromptToday = this.plugin.settings.userSummaryPromptToday;
                    const userPromptWeek = this.plugin.settings.userSummaryPromptWeek;
                    if (force || !cachedToday) {
                        const todayPosts = posts.filter(p => !p.deleted && getDateKeyLocal(new Date(p.created)) === todayKey && p.userId === '@you');
                        const todayPrompt = userPromptToday && userPromptToday.trim() ? userPromptToday : geminiSummaryPromptToday;
                        const todayText = todayPosts.length > 0 ? await generateSummary(todayPosts, todayPrompt, this.plugin) : '';
                        await this.renderMarkdown(this.todaySummaryEl!, todayText || '本日の投稿がありません。', this.lastTodaySummary, v => this.lastTodaySummary = v);
                        await saveReflectionSummary('today', todayKey, todayText, this.app);
                    }
                    if (force || !cachedWeek) {
                        const weekPosts = posts.filter(p => !p.deleted && getDateKeyLocal(new Date(p.created)) >= weekStart && getDateKeyLocal(new Date(p.created)) <= weekKey && p.userId === '@you');
                        const weekPrompt = userPromptWeek && userPromptWeek.trim() ? userPromptWeek : geminiSummaryPromptWeek;
                        const weekText = weekPosts.length > 0 ? await generateSummary(weekPosts, weekPrompt, this.plugin) : '';
                        await this.renderMarkdown(this.weekSummaryEl!, weekText || '今週の投稿がありません。', this.lastWeekSummary, v => this.lastWeekSummary = v);
                        await saveReflectionSummary('week', weekKey, weekText, this.app);
                    }
                    // グラフデータ取得・描画（既存）
                    const days = getLastNDays(7);
                    const daySet = new Set(days);
                    const countMap: Record<string, number> = {};
                    for (const post of posts) {
                        if (post.deleted) continue;
                        const d = getDateKey(new Date(post.created));
                        if (daySet.has(d)) {
                            countMap[d] = (countMap[d] || 0) + 1;
                        }
                    }
                    const counts = days.map(d => countMap[d] || 0);
                    if (this.lastChartData && this.lastChartData.length === counts.length && this.lastChartData.every((v, i) => v === counts[i])) {
                        // 何もしない
                    } else if (this.canvasEl) {
                        if (this.chart) {
                            this.chart.destroy();
                            this.chart = null;
                        }
                        const ctx = this.canvasEl.getContext('2d');
                        if (ctx) {
                            this.chart = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: days.map(d => d.slice(5)),
                                    datasets: [{
                                        label: '投稿数',
                                        data: counts,
                                        borderColor: '#4a90e2',
                                        backgroundColor: 'rgba(74,144,226,0.15)',
                                        fill: true,
                                        tension: 0.3,
                                        pointRadius: 3,
                                    }]
                                },
                                options: {
                                    responsive: false, // 追加: レスポンシブ無効化
                                    animation: false, // アニメーション無効化
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        x: {
                                            grid: { display: false },
                                            ticks: {
                                                maxTicksLimit: 5 // ★ラベル数を最大5件に制限
                                            }
                                        },
                                        y: { beginAtZero: true, grid: { color: '#eee' } }
                                    }
                                }
                            });
                        }
                        this.lastChartData = [...counts];
                    }
                })(),
                timeoutPromise
            ]);
        } catch (e) {
            if (this.manualBtnEl) {
                this.manualBtnEl.innerText = timeoutOccured ? 'タイムアウトしました' : 'まとめ生成失敗';
                setTimeout(() => {
                    this.manualBtnEl!.innerText = 'まとめ生成';
                    this.manualBtnEl!.disabled = false;
                }, 3000);
                return;
            }
        }
        if (this.manualBtnEl) {
            this.manualBtnEl.innerText = 'まとめ生成';
            this.manualBtnEl.disabled = false;
        }
    }

    private async renderMarkdown(el: HTMLElement, text: string, lastText: string | null, setLast: (v: string) => void) {
        if (lastText === text) return;
        el.empty();
        await renderMarkdownBatchWithCache(text, el, '', new Component());
        setLast(text);
    }

    private updateGraphAndSummaries() {
        const settings: ReflectionWidgetSettings = this.config.settings || {};
        const autoEnabled = settings.aiSummaryAutoEnabled ?? false;
        const autoInterval = typeof settings.aiSummaryAutoIntervalHours === 'number' ? settings.aiSummaryAutoIntervalHours : -1;
        const manualEnabled = settings.aiSummaryManualEnabled ?? true;
        // 手動発火ボタン（初回のみ生成）
        if (manualEnabled && this.aiSummarySectionEl && !this.manualBtnEl) {
            this.manualBtnEl = document.createElement('button');
            this.manualBtnEl.innerText = 'まとめ生成';
            this.manualBtnEl.style.margin = '10px 0 0 0';
            this.manualBtnEl.onclick = async () => {
                this.manualBtnEl!.disabled = true;
                this.manualBtnEl!.innerText = '生成中...';
                const trigger = () => this.runSummary(true);
                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(trigger);
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
                    (window as any).requestIdleCallback(() => this.runSummary());
                } else {
                    requestAnimationFrame(() => this.runSummary());
                }
            }, autoInterval * 60 * 60 * 1000);
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => this.runSummary());
            } else {
                requestAnimationFrame(() => this.runSummary());
            }
        } else {
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(() => this.runSummary());
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
        this.todaySummaryEl = null;
        this.weekSummaryEl = null;
        this.aiSummarySectionEl = null;
        this.manualBtnEl = null;
    }
} 