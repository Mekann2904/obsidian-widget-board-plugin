import { App } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import { TweetRepository } from '../tweetWidget/TweetRepository';
import type { TweetWidgetPost, TweetWidgetSettings } from '../tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../tweetWidget/constants';
import Chart from 'chart.js/auto';

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

export class ReflectionWidget implements WidgetImplementation {
    id = 'reflection-widget';

    create(config: WidgetConfig, app: App, plugin: any): HTMLElement {
        // widgetクラスでラップ
        const el = document.createElement('div');
        el.className = 'widget reflection-widget';

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

        (async () => {
            const dbPath = getTweetDbPath(plugin);
            const repo = new TweetRepository(app, dbPath);
            const settings: TweetWidgetSettings = await repo.load();
            const posts: TweetWidgetPost[] = settings.posts || [];
            const days = getLastNDays(7);
            const counts = days.map(day => posts.filter(p => !p.deleted && getDateKey(new Date(p.created)) === day).length);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                new Chart(ctx, {
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
        })();
        return el;
    }
}

// Widget登録用（必要に応じて）
export default ReflectionWidget; 