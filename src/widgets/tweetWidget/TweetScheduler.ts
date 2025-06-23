import { Notice } from 'obsidian';
import type { TweetWidgetSettings, TweetWidgetPost, ScheduledTweet } from './types';
import { computeNextTime, ScheduleOptions } from './scheduleUtils';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import { t } from '../../i18n';

/**
 * スケジュール投稿の管理を担当するクラス
 */
export class TweetScheduler {
    private checkId: number | null = null;

    /**
     * スケジュールチェックループを開始
     */
    startScheduleLoop(checkCallback: () => Promise<void>): void {
        if (this.checkId !== null) return;
        checkCallback(); // 初回実行
        this.checkId = window.setInterval(checkCallback, 60000); // 1分ごと
    }

    /**
     * スケジュールチェックループを停止
     */
    stopScheduleLoop(): void {
        if (this.checkId !== null) {
            clearInterval(this.checkId);
            this.checkId = null;
        }
    }

    /**
     * スケジュール投稿の追加
     */
    schedulePost(text: string, opts: ScheduleOptions & {userId?: string; userName?: string; aiPrompt?: string; aiModel?: string}, settings: TweetWidgetSettings): void {
        const nextTime = computeNextTime(opts);
        if (nextTime === null) return;

        const scheduledPost: ScheduledTweet = {
            id: `sch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            text: text.trim(),
            hour: opts.hour,
            minute: opts.minute,
            daysOfWeek: opts.daysOfWeek,
            startDate: opts.startDate,
            endDate: opts.endDate,
            nextTime: nextTime,
            userId: opts.userId,
            userName: opts.userName,
            aiPrompt: opts.aiPrompt,
            aiModel: opts.aiModel
        };

        if (!settings.scheduledPosts) settings.scheduledPosts = [];
        settings.scheduledPosts.push(scheduledPost);
    }

    /**
     * スケジュール投稿のチェックと実行
     */
    async checkScheduledPosts(
        settings: TweetWidgetSettings, 
        language: string,
        addPost: (post: TweetWidgetPost) => void,
        updatePostCount: (timestamp: number, count: number) => void,
        triggerAiReply?: (post: TweetWidgetPost) => void,
        plugin?: any
    ): Promise<boolean> {
        if (!settings.scheduledPosts) return false;

        const now = Date.now();
        let executed = false;

        for (const scheduled of [...settings.scheduledPosts]) {
            if (scheduled.nextTime <= now) {
                // 実行時刻を過ぎている
                let finalText = scheduled.text;

                // AI生成が有効な場合（{{ai}}プレースホルダーがある場合）
                if (scheduled.aiPrompt && scheduled.text.includes('{{ai}}') && plugin) {
                    try {
                        const geminiSettings = plugin.settings.llm?.gemini;
                        if (geminiSettings?.apiKey) {
                            const aiReply = await GeminiProvider.generateReply(scheduled.aiPrompt, {
                                plugin: plugin,
                                apiKey: deobfuscate(geminiSettings.apiKey),
                                model: scheduled.aiModel || geminiSettings.model || 'gemini-1.5-flash-latest'
                            });
                            
                            if (aiReply && typeof aiReply === 'string' && aiReply.trim()) {
                                // JSONパース試行
                                try {
                                    const parsed = JSON.parse(aiReply);
                                    if (parsed?.reply) {
                                        finalText = scheduled.text.replace('{{ai}}', parsed.reply.trim());
                                    } else {
                                        finalText = scheduled.text.replace('{{ai}}', aiReply.trim());
                                    }
                                } catch {
                                    finalText = scheduled.text.replace('{{ai}}', aiReply.trim());
                                }
                            } else {
                                finalText = scheduled.text.replace('{{ai}}', '[AI生成失敗]');
                            }
                        } else {
                            finalText = scheduled.text.replace('{{ai}}', '[API設定なし]');
                        }
                    } catch (error) {
                        console.error('スケジュール投稿のAI生成でエラー:', error);
                        finalText = scheduled.text.replace('{{ai}}', '[AI生成失敗]');
                    }
                }

                // 新規投稿として追加
                const newPost: TweetWidgetPost = {
                    id: `tw-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                    text: finalText,
                    created: now,
                    userId: scheduled.userId || settings.userId || '@scheduled',
                    userName: scheduled.userName || settings.userName || 'Scheduled',
                    avatarUrl: settings.avatarUrl,
                    verified: settings.verified
                };

                addPost(newPost);
                updatePostCount(newPost.created, 1);
                
                if (triggerAiReply) {
                    triggerAiReply(newPost);
                }

                new Notice('スケジュール投稿が実行されました');

                // 次回実行時刻を更新
                const nextOptions: ScheduleOptions = {
                    hour: scheduled.hour,
                    minute: scheduled.minute,
                    daysOfWeek: scheduled.daysOfWeek,
                    startDate: scheduled.startDate,
                    endDate: scheduled.endDate
                };
                
                const nextTime = computeNextTime(nextOptions);
                if (nextTime) {
                    scheduled.nextTime = nextTime;
                } else {
                    // 次回実行時刻がない場合は削除
                    settings.scheduledPosts = settings.scheduledPosts!.filter(p => p.id !== scheduled.id);
                }
                
                executed = true;
            }
        }

        return executed;
    }
} 