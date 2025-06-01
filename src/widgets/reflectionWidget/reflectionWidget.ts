import { App } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import { TweetRepository } from '../tweetWidget/TweetRepository';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../tweetWidget/constants';
import Chart from 'chart.js/auto';
import { LLMManager } from '../../llm/llmManager';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
import { geminiSummaryPromptToday, geminiSummaryPromptWeek } from '../../llm/gemini/summaryPrompts';
import { deobfuscate } from '../../utils';

function getTweetDbPath(plugin: any): string {
    const { tweetDbLocation, tweetDbCustomPath } = plugin.settings;
    if (tweetDbLocation === 'custom' && tweetDbCustomPath) {
        return tweetDbCustomPath;
    }
    // デフォルト: Vault直下
    return 'tweets.json';
}

function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
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
    const day = now.getDay(); // 0:日〜6:土
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
    return [getDateKey(start), getDateKey(end)];
}

async function generateSummary(posts: TweetWidgetPost[], prompt: string, plugin: any): Promise<string> {
    if (!plugin.llmManager) return 'LLM未初期化';
    // LLM設定をコピー
    const context = JSON.parse(JSON.stringify(plugin.settings.llm || {}));
    // Gemini APIキーが難読化されている場合は復号してセット
    if (context.gemini && context.gemini.apiKey) {
        context.apiKey = deobfuscate(context.gemini.apiKey);
    }
    const text = posts.map(p => p.text).join('\n');
    const promptText = prompt.replace('{posts}', text);
    console.log('Gemini送信プロンプト:', promptText);
    console.log('Gemini送信context:', context);
    try {
        const result = await plugin.llmManager.generateReplyWithDefault(promptText, context);
        return result;
    } catch (e) {
        console.error('要約生成エラー:', e);
        return '要約生成に失敗しました';
    }
}

// AI要約の一時保存・取得・クリア
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

async function clearOldReflectionSummaries(app: App) {
    const path = 'data.json';
    try {
        const raw = await app.vault.adapter.read(path);
        const data = JSON.parse(raw);
        if (data.reflectionSummaries) {
            const todayKey = getDateKey(new Date());
            for (const type of Object.keys(data.reflectionSummaries)) {
                if (data.reflectionSummaries[type].date !== todayKey) {
                    delete data.reflectionSummaries[type];
                }
            }
            await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
        }
    } catch {}
}

export class ReflectionWidget implements WidgetImplementation {
    id = 'reflection-widget';
    private autoTimer: any = null;
    private chart: Chart | null = null;

    create(config: WidgetConfig, app: App, plugin: any): HTMLElement {
        const el = document.createElement('div');
        el.className = 'widget reflection-widget';

        // 設定取得
        const settings: ReflectionWidgetSettings = config.settings || {};
        const autoEnabled = settings.aiSummaryAutoEnabled ?? false;
        const autoInterval = typeof settings.aiSummaryAutoIntervalHours === 'number' ? settings.aiSummaryAutoIntervalHours : -1;
        const manualEnabled = settings.aiSummaryManualEnabled ?? true;

        // タイトル
        const title = document.createElement('div');
        title.className = 'widget-title';
        title.innerText = config.title || '振り返りレポート';
        el.appendChild(title);

        // コンテンツ
        const content = document.createElement('div');
        content.className = 'widget-content';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.alignItems = 'center';
        content.style.justifyContent = 'center';
        content.style.padding = '8px 0 0 0';
        el.appendChild(content);

        // グラフタイトル
        const graphTitle = document.createElement('div');
        graphTitle.style.fontWeight = 'bold';
        graphTitle.style.marginBottom = '4px';
        graphTitle.style.textAlign = 'center';
        graphTitle.innerText = '直近7日間の投稿数トレンド';
        content.appendChild(graphTitle);

        // グラフcanvas
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 120;
        canvas.style.margin = '0 auto 0 auto';
        content.appendChild(canvas);

        // AIまとめセクション
        const aiSummarySection = document.createElement('div');
        aiSummarySection.style.width = '100%';
        aiSummarySection.style.marginTop = '18px';
        aiSummarySection.style.padding = '8px 0 0 0';
        aiSummarySection.style.borderTop = '1px solid var(--divider-color, #444)';
        content.appendChild(aiSummarySection);

        // 今日・今週のまとめタイトル
        const todayTitle = document.createElement('div');
        todayTitle.style.fontWeight = 'bold';
        todayTitle.style.margin = '8px 0 2px 0';
        todayTitle.innerText = 'AIによる今日のまとめ';
        aiSummarySection.appendChild(todayTitle);
        const todaySummary = document.createElement('div');
        todaySummary.innerText = '';
        todaySummary.style.minHeight = '2em';
        aiSummarySection.appendChild(todaySummary);

        const weekTitle = document.createElement('div');
        weekTitle.style.fontWeight = 'bold';
        weekTitle.style.margin = '12px 0 2px 0';
        weekTitle.innerText = 'AIによる今週のまとめ';
        aiSummarySection.appendChild(weekTitle);
        const weekSummary = document.createElement('div');
        weekSummary.innerText = '';
        weekSummary.style.minHeight = '2em';
        aiSummarySection.appendChild(weekSummary);

        // まとめ生成関数
        const runSummary = async () => {
            // まず保存済み要約があれば即表示
            const todayKey = getDateKey(new Date());
            const [weekStart, weekEnd] = getWeekRange();
            const weekKey = getDateKey(new Date(weekEnd));
            const cachedToday = await loadReflectionSummary('today', todayKey, app);
            const cachedWeek = await loadReflectionSummary('week', weekKey, app);
            if (cachedToday) todaySummary.innerText = cachedToday;
            else todaySummary.innerText = '生成中...';
            if (cachedWeek) weekSummary.innerText = cachedWeek;
            else weekSummary.innerText = '生成中...';

            // グラフはキャッシュ有無に関係なく毎回描画
            const dbPath = getTweetDbPath(plugin);
            const repo = new TweetRepository(app, dbPath);
            const tweetSettings: TweetWidgetSettings = await repo.load();
            const posts: TweetWidgetPost[] = tweetSettings.posts || [];
            const days = getLastNDays(7);
            const counts = days.map(day => posts.filter(p => !p.deleted && getDateKey(new Date(p.created)) === day).length);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (this.chart) {
                    this.chart.destroy();
                }
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
                        responsive: false,
                        plugins: {
                            legend: { display: false },
                        },
                        scales: {
                            x: { grid: { display: false } },
                            y: { beginAtZero: true, grid: { color: '#eee' } }
                        }
                    }
                });
            }

            // 既にキャッシュがあれば要約生成部分だけスキップ
            if (cachedToday && cachedWeek) return;

            // AIまとめ生成
            // 今日
            if (!cachedToday) {
                const todayPosts = posts.filter(p => !p.deleted && getDateKey(new Date(p.created)) === todayKey);
                todaySummary.innerText = todayPosts.length > 0 ? await generateSummary(todayPosts, geminiSummaryPromptToday, plugin) : '本日の投稿がありません。';
                await saveReflectionSummary('today', todayKey, todaySummary.innerText, app);
            }
            // 今週
            if (!cachedWeek) {
                const weekPosts = posts.filter(p => !p.deleted && getDateKey(new Date(p.created)) >= weekStart && getDateKey(new Date(p.created)) <= weekKey);
                weekSummary.innerText = weekPosts.length > 0 ? await generateSummary(weekPosts, geminiSummaryPromptWeek, plugin) : '今週の投稿がありません。';
                await saveReflectionSummary('week', weekKey, weekSummary.innerText, app);
            }
        };

        // 手動発火ボタン
        if (manualEnabled) {
            const btn = document.createElement('button');
            btn.innerText = 'まとめ生成';
            btn.style.margin = '10px 0 0 0';
            btn.onclick = async () => {
                btn.disabled = true;
                btn.innerText = '生成中...';
                await runSummary();
                btn.disabled = false;
                btn.innerText = 'まとめ生成';
            };
            aiSummarySection.appendChild(btn);
        }

        // 自動発火タイマー
        if (autoEnabled && autoInterval > 0) {
            // 初回実行
            runSummary();
            // 既存タイマー解除
            if (this.autoTimer) clearInterval(this.autoTimer);
            this.autoTimer = setInterval(runSummary, autoInterval * 60 * 60 * 1000);
        } else {
            // 自動発火しない場合は初回のみ実行
            runSummary();
        }

        return el;
    }
}

// Widget登録用（必要に応じて）
export default ReflectionWidget; 