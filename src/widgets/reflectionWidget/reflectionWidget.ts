import { App, MarkdownRenderer } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import { TweetRepository } from '../tweetWidget/TweetRepository';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../tweetWidget/constants';
import { LLMManager } from '../../llm/llmManager';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
import { geminiSummaryPromptToday, geminiSummaryPromptWeek } from '../../llm/gemini/summaryPrompts';
import { deobfuscate } from '../../utils';
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

function getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ローカルタイム基準でYYYY-MM-DDを返す
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
    // 各投稿に日付を付与してテキスト化
    const text = posts.map(p => {
        const dateStr = getDateKeyLocal(new Date(p.created));
        return `[${dateStr}] ${p.text}`;
    }).join('\n');
    const promptText = prompt.replace('{posts}', text);
    debugLog(plugin, 'Gemini送信プロンプト:', promptText);
    debugLog(plugin, 'Gemini送信context:', context);
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
    private chart: any | null = null;
    private lastChartData: number[] | null = null;
    private lastTodaySummary: string | null = null;
    private lastWeekSummary: string | null = null;
    private ui: ReflectionWidgetUI | null = null;
    public config!: WidgetConfig;
    public app!: App;
    public plugin: any;

    create(config: WidgetConfig, app: App, plugin: any): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        const el = document.createElement('div');
        el.className = 'widget reflection-widget';
        this.ui = new ReflectionWidgetUI(this, el, config, app, plugin);
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