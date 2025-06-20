import type { TweetWidgetPost, TweetWidgetFile } from './types';
import { safeFetch } from '../../utils';

export function parseTags(text: string): string[] {
    const regex = /#([\w-]+)/g;
    return (text.match(regex) || []).map(tag => tag.substring(1));
}

export function parseLinks(text: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const matches = text.matchAll(regex);
    return Array.from(matches, m => m[1]);
}

export function formatTimeAgo(time: number): string {
    const now = Date.now();
    const diff = Math.floor((now - time) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    const d = new Date(time);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function wrapSelection(input: HTMLTextAreaElement, wrapper: string) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    const selectedText = value.substring(start, end);
    const replacement = wrapper + selectedText + wrapper;
    input.value = value.substring(0, start) + replacement + value.substring(end);
    input.selectionStart = start + wrapper.length;
    input.selectionEnd = end + wrapper.length;
    input.focus();
}

// TweetWidgetPost型のバリデーション関数
export function validatePost(raw: unknown): TweetWidgetPost {
    const data = raw as Partial<TweetWidgetPost> | undefined;
    return {
        id: data?.id || 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        text: typeof data?.text === 'string' ? data.text : '',
        created: typeof data?.created === 'number' ? data.created! : Date.now(),
        updated: typeof data?.updated === 'number' ? data.updated! : Date.now(),
        files: data && Array.isArray(data.files) ? data.files as TweetWidgetFile[] : [],
        like: typeof data?.like === 'number' ? data.like! : 0,
        liked: !!data?.liked,
        retweet: typeof data?.retweet === 'number' ? data.retweet! : 0,
        retweeted: !!data?.retweeted,
        edited: !!data?.edited,
        replyCount: typeof data?.replyCount === 'number' ? data.replyCount! : 0,
        quoteId: typeof data?.quoteId === 'string' ? data.quoteId : null,
        deleted: !!data?.deleted,
        bookmark: !!data?.bookmark,
        contextNote: typeof data?.contextNote === 'string' ? data.contextNote : null,
        threadId: typeof data?.threadId === 'string' ? data.threadId : null,
        visibility: (data as TweetWidgetPost | undefined)?.visibility || 'public',
        noteQuality: (data as TweetWidgetPost | undefined)?.noteQuality || 'fleeting',
        taskStatus: (data as TweetWidgetPost | undefined)?.taskStatus || null,
        tags: data && Array.isArray(data.tags) ? data.tags as string[] : [],
        links: data && Array.isArray(data.links) ? data.links as string[] : [],
        userId: typeof data?.userId === 'string' ? data.userId : '@you',
        userName: typeof data?.userName === 'string' ? data.userName : 'あなた',
        verified: !!data?.verified
    };
}

// テキストからYouTube動画IDを抽出し、クリーンなURLを返す
export function extractYouTubeUrl(text: string): string | null {
    // youtu.be/ID, youtube.com/watch?v=ID, youtube.com/live/ID のID部分だけ抽出
    const regex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([\w-]{11})/;
    const match = text.match(regex);
    if (match && match[1]) {
        // クリーンな youtu.be 形式で返す
        return `https://youtu.be/${match[1]}`;
    }
    return null;
}

// YouTubeの動画タイトルを取得する関数（safeFetch使用）
export async function fetchYouTubeTitle(url: string): Promise<string | null> {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    try {
        const res = await safeFetch(oembedUrl, { method: 'GET' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.title as string;
    } catch {
        return null;
    }
} 