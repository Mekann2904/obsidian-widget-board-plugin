import { App, MarkdownRenderer } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import { TweetRepository } from '../tweetWidget';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../tweetWidget/constants';
import { LLMManager } from '../../llm/llmManager';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
import { geminiSummaryPromptToday, geminiSummaryPromptWeek } from '../../llm/gemini/summaryPrompts';
import { deobfuscate, getDateKey, getDateKeyLocal } from '../../utils';
import { debugLog } from '../../utils/logger';
import { ReflectionWidgetUI } from './reflectionWidgetUI';

let Chart: any;

function getTweetDbPath(plugin: any): string {
    const { baseFolder } = plugin.settings;
    if (baseFolder) {
        const folder = baseFolder.endsWith('/') ? baseFolder.slice(0, -1) : baseFolder;
        return `${folder}/tweets.json`;
    }
    // デフォルト: Vault直下
    return 'tweets.json';
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


async function generateSummary(posts: TweetWidgetPost[], prompt: string, plugin: any): Promise<string> {
    if (!plugin.llmManager) return 'LLM未初期化';
    // LLM設定をコピー
    const context = JSON.parse(JSON.stringify(plugin.settings.llm || {}));
    // Gemini APIキーが難読化されている場合は復号してセット
    if (context.gemini && context.gemini.apiKey) {
        context.apiKey = deobfuscate(context.gemini.apiKey);
    }
    if (plugin.settings.reflectionAiModel) {
        context.model = plugin.settings.reflectionAiModel;
    }
    // 各投稿に日付を付与してテキスト化
    const text = posts.map(p => {
        const d = new Date(p.created);
        const dateStr = getDateKeyLocal(d);
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
        const youbi = weekDays[d.getDay()];
        return `[${dateStr}(${youbi}) ${hour}:${min}] ${p.text}`;
    }).join('\n');
    const promptText = prompt.replace('{posts}', text);
    debugLog(plugin, 'Gemini送信プロンプト:', promptText);
    debugLog(plugin, 'Gemini送信context:', context);
    try {
        const result = await plugin.llmManager.generateReplyWithDefault(promptText, context);
        debugLog(plugin, 'Gemini生成結果:', result);
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

// プリロードバンドル型を定義
export interface ReflectionWidgetPreloadBundle {
    chartModule: any;
    todaySummary: { summary: string|null, html: string|null, postCount: number };
    weekSummary: { summary: string|null, html: string|null, postCount: number };
}

export class ReflectionWidget implements WidgetImplementation {
    id = 'reflection-widget';
    private autoTimer: any = null;
    private chart: any | null = null;
    private lastChartData: number[] | null = null;
    private lastTodaySummary: string | null = null;
    private lastWeekSummary: string | null = null;
    private ui: ReflectionWidgetUI | null = null;
    public config!: WidgetConfig;
    public app!: App;
    public plugin: any;

    // プリロードバンドルを受け取れるように拡張
    create(config: WidgetConfig, app: App, plugin: any, preloadBundle?: ReflectionWidgetPreloadBundle): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        const el = document.createElement('div');
        el.className = 'widget reflection-widget';
        this.ui = new ReflectionWidgetUI(this, el, config, app, plugin, preloadBundle);
        this.ui.render();
        return el;
    }

    // 外部から設定変更時に呼ばれる
    public updateExternalSettings(newSettings: Partial<ReflectionWidgetSettings>, widgetId?: string) {
        Object.assign(this.config.settings, newSettings);
        this.refresh();
    }

    // 状態変化時にUIを再描画
    public refresh() {
        this.ui?.scheduleRender();
    }

    // データ取得や状態管理のメソッドはここに残す
}

// Widget登録用（必要に応じて）
export default ReflectionWidget; 