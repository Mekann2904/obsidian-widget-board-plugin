import type { TweetWidgetPost } from './types';
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
export function validatePost(raw: any): TweetWidgetPost {
    return {
        id: raw.id || 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        text: typeof raw.text === 'string' ? raw.text : '',
        created: typeof raw.created === 'number' ? raw.created : Date.now(),
        updated: typeof raw.updated === 'number' ? raw.updated : Date.now(),
        files: Array.isArray(raw.files) ? raw.files : [],
        like: typeof raw.like === 'number' ? raw.like : 0,
        liked: !!raw.liked,
        retweet: typeof raw.retweet === 'number' ? raw.retweet : 0,
        retweeted: !!raw.retweeted,
        edited: !!raw.edited,
        replyCount: typeof raw.replyCount === 'number' ? raw.replyCount : 0,
        quoteId: typeof raw.quoteId === 'string' ? raw.quoteId : null,
        deleted: !!raw.deleted,
        bookmark: !!raw.bookmark,
        contextNote: typeof raw.contextNote === 'string' ? raw.contextNote : null,
        threadId: typeof raw.threadId === 'string' ? raw.threadId : null,
        visibility: raw.visibility || 'public',
        noteQuality: raw.noteQuality || 'fleeting',
        taskStatus: raw.taskStatus || null,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        links: Array.isArray(raw.links) ? raw.links : [],
        userId: typeof raw.userId === 'string' ? raw.userId : '@you',
        userName: typeof raw.userName === 'string' ? raw.userName : 'あなた',
        verified: !!raw.verified
    };
}

// テキストからYouTube動画IDを抽出し、クリーンなURLを返す
export function extractYouTubeUrl(text: string): string | null {
    // youtu.be/ID または youtube.com/watch?v=ID のID部分だけ抽出
    const regex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
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