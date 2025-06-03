import type { TweetWidgetPost } from './types';
import { Notice } from 'obsidian';

const ALL_COLUMNS = [
    { key: 'id', label: 'ID' },
    { key: 'created', label: '日付' },
    { key: 'user', label: 'ユーザー' },
    { key: 'text', label: '内容' },
    { key: 'like', label: 'いいね' },
    { key: 'tags', label: 'タグ' },
];

export class TweetWidgetDataViewer {
    private posts: TweetWidgetPost[];
    private container: HTMLElement;
    private filtered: TweetWidgetPost[] = [];
    private searchText: string = '';
    private userFilter: string = 'all';
    private sortKey: string = 'created';
    private sortDesc: boolean = true;
    private dateFrom: string = '';
    private dateTo: string = '';
    private visibleColumns: Set<string> = new Set(['id', 'created', 'user', 'text', 'like', 'tags']);

    constructor(posts: TweetWidgetPost[], container: HTMLElement) {
        this.posts = posts;
        this.container = container;
        this.loadVisibleColumns();
        this.render();
    }

    private render() {
        this.container.empty();
        // --- カラム選択ハンバーガーメニュー ---
        const menuBar = this.container.createDiv({ cls: 'tweet-data-viewer-menubar' });
        const menuGroup = menuBar.createDiv({ cls: 'tweet-data-viewer-menugroup' });
        const menuBtn = menuGroup.createEl('button', { cls: 'tweet-data-viewer-hamburger', text: '☰' });
        const csvBtn = menuGroup.createEl('button', { text: 'CSVコピー', cls: 'tweet-data-viewer-csv-btn' });
        csvBtn.onclick = () => {
            this.copyCsvToClipboard();
        };
        const mdBtn = menuGroup.createEl('button', { text: 'Markdownコピー', cls: 'tweet-data-viewer-md-btn' });
        mdBtn.onclick = () => {
            this.copyMarkdownToClipboard();
        };
        const menuDropdown = menuGroup.createDiv({ cls: 'tweet-data-viewer-dropdown' });
        menuDropdown.style.display = 'none';
        menuBtn.onclick = (e) => {
            menuDropdown.style.display = menuDropdown.style.display === 'none' ? '' : 'none';
        };
        ALL_COLUMNS.forEach(col => {
            const item = menuDropdown.createDiv({ cls: 'tweet-data-viewer-dropdown-item' });
            const checkbox = item.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.visibleColumns.has(col.key);
            checkbox.onchange = () => {
                if (checkbox.checked) this.visibleColumns.add(col.key);
                else this.visibleColumns.delete(col.key);
                this.saveVisibleColumns();
                this.renderTable();
            };
            item.appendText(' ' + col.label);
        });
        document.addEventListener('click', (e) => {
            if (!menuBar.contains(e.target as Node)) menuDropdown.style.display = 'none';
        });
        // --- 検索・フィルタUI ---
        const controls = this.container.createDiv({ cls: 'tweet-data-viewer-controls' });
        // 検索ボックス
        const searchInput = controls.createEl('input', { type: 'text', placeholder: '本文検索...' });
        searchInput.value = this.searchText;
        searchInput.oninput = () => {
            this.searchText = searchInput.value;
            this.applyQuery();
        };
        // ユーザーフィルタ
        const userSelect = controls.createEl('select');
        const users = Array.from(new Set(this.posts.map(p => (p.userName || p.userId || ''))));
        userSelect.createEl('option', { value: 'all', text: '全ユーザー' });
        users.forEach(u => {
            if (u) userSelect.createEl('option', { value: u, text: u });
        });
        userSelect.value = this.userFilter;
        userSelect.onchange = () => {
            this.userFilter = userSelect.value;
            this.applyQuery();
        };
        // 日付範囲
        const dateFromInput = controls.createEl('input', { type: 'date' });
        dateFromInput.value = this.dateFrom;
        dateFromInput.onchange = () => {
            this.dateFrom = dateFromInput.value;
            this.applyQuery();
        };
        const dateToInput = controls.createEl('input', { type: 'date' });
        dateToInput.value = this.dateTo;
        dateToInput.onchange = () => {
            this.dateTo = dateToInput.value;
            this.applyQuery();
        };
        // ソート順
        const sortSelect = controls.createEl('select');
        [
            { value: 'created', label: '日付' },
            { value: 'like', label: 'いいね数' },
            { value: 'userName', label: 'ユーザー' },
        ].forEach(opt => {
            sortSelect.createEl('option', { value: opt.value, text: opt.label });
        });
        sortSelect.value = this.sortKey;
        sortSelect.onchange = () => {
            this.sortKey = sortSelect.value;
            this.applyQuery();
        };
        // 昇順/降順
        const sortDirBtn = controls.createEl('button', { text: this.sortDesc ? '▼' : '▲' });
        sortDirBtn.onclick = () => {
            this.sortDesc = !this.sortDesc;
            sortDirBtn.textContent = this.sortDesc ? '▼' : '▲';
            this.applyQuery();
        };
        // --- テーブル ---
        this.applyQuery();
    }

    private applyQuery() {
        // フィルタ・検索・ソート
        this.filtered = this.posts.filter(p => {
            if (this.userFilter !== 'all' && ((p.userName || p.userId || '') !== this.userFilter)) return false;
            if (this.searchText && !p.text.includes(this.searchText)) return false;
            if (this.dateFrom) {
                const d = new Date(p.created);
                if (d < new Date(this.dateFrom)) return false;
            }
            if (this.dateTo) {
                const d = new Date(p.created);
                if (d > new Date(this.dateTo + 'T23:59:59')) return false;
            }
            return true;
        });
        this.filtered.sort((a, b) => {
            let v1 = (a as any)[this.sortKey];
            let v2 = (b as any)[this.sortKey];
            if (this.sortKey === 'userName') {
                v1 = a.userName || a.userId;
                v2 = b.userName || b.userId;
            }
            if (v1 === undefined) v1 = '';
            if (v2 === undefined) v2 = '';
            if (v1 < v2) return this.sortDesc ? 1 : -1;
            if (v1 > v2) return this.sortDesc ? -1 : 1;
            return 0;
        });
        this.renderTable();
    }

    private renderTable() {
        // 既存テーブル削除
        const oldTable = this.container.querySelector('.tweet-data-viewer-table');
        if (oldTable) oldTable.remove();
        const table = this.container.createEl('table', { cls: 'tweet-data-viewer-table' });
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const thFragment = document.createDocumentFragment();
        ALL_COLUMNS.forEach(col => {
            if (!this.visibleColumns.has(col.key)) return;
            const th = document.createElement('th');
            th.className = `tweet-data-viewer-th ${col.key}`;
            th.textContent = col.label;
            thFragment.appendChild(th);
        });
        headerRow.appendChild(thFragment);
        const tbody = table.createTBody();
        this.filtered.forEach(p => {
            const row = tbody.insertRow();
            const tdFragment = document.createDocumentFragment();
            ALL_COLUMNS.forEach(col => {
                if (!this.visibleColumns.has(col.key)) return;
                let cellValue = '';
                if (col.key === 'id') cellValue = p.id;
                else if (col.key === 'created') cellValue = this.formatDate(p.created);
                else if (col.key === 'user') cellValue = (p.userName || p.userId || '');
                else if (col.key === 'text') {
                    cellValue = p.text;
                    cellValue = cellValue.length > 40 ? cellValue.slice(0, 40) + '...' : cellValue;
                    cellValue = cellValue.replace(/\n/g, '<br>');
                } else if (col.key === 'like') cellValue = String(p.like || 0);
                else if (col.key === 'tags') {
                    cellValue = (p.tags && p.tags.length > 0) ? p.tags.map(t => `#${t}`).join(', ') : '';
                    cellValue = cellValue.replace(/\n/g, '<br>');
                }
                const td = document.createElement('td');
                td.className = `tweet-data-viewer-td ${col.key}`;
                td.textContent = cellValue;
                tdFragment.appendChild(td);
            });
            row.appendChild(tdFragment);
        });
    }

    private formatDate(ts: number): string {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    private copyCsvToClipboard() {
        // 現在表示中のカラム・データでCSV生成
        const cols = Array.from(ALL_COLUMNS).filter(col => this.visibleColumns.has(col.key));
        const header = cols.map(col => col.label);
        const rows = this.filtered.map(p => {
            return cols.map(col => {
                if (col.key === 'id') return p.id;
                if (col.key === 'created') return this.formatDate(p.created);
                if (col.key === 'user') return p.userName || p.userId || '';
                if (col.key === 'text') return p.text.replace(/\n/g, ' ');
                if (col.key === 'like') return String(p.like || 0);
                if (col.key === 'tags') return (p.tags && p.tags.length > 0) ? p.tags.join(',') : '';
                return '';
            });
        });
        const csv = [header, ...rows].map(row => row.map(cell => '"' + cell.replace(/"/g, '""') + '"').join(',')).join('\n');
        navigator.clipboard.writeText(csv).then(() => {
            new Notice('CSVとしてコピーしました');
        }, () => {
            new Notice('コピーに失敗しました');
        });
    }

    private copyMarkdownToClipboard() {
        // 現在表示中のカラム・データでMarkdownテーブル生成
        const cols = Array.from(ALL_COLUMNS).filter(col => this.visibleColumns.has(col.key));
        const header = cols.map(col => col.label);
        const sep = cols.map(() => '---');
        const rows = this.filtered.map(p => {
            return cols.map(col => {
                if (col.key === 'id') return p.id;
                if (col.key === 'created') return this.formatDate(p.created);
                if (col.key === 'user') return p.userName || p.userId || '';
                if (col.key === 'text') return p.text.replace(/\n/g, ' ');
                if (col.key === 'like') return String(p.like || 0);
                if (col.key === 'tags') return (p.tags && p.tags.length > 0) ? p.tags.join(',') : '';
                return '';
            });
        });
        const md = [
            '| ' + header.join(' | ') + ' |',
            '| ' + sep.join(' | ') + ' |',
            ...rows.map(row => '| ' + row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ') + ' |')
        ].join('\n');
        navigator.clipboard.writeText(md).then(() => {
            new Notice('Markdownテーブルとしてコピーしました');
        }, () => {
            new Notice('コピーに失敗しました');
        });
    }

    private saveVisibleColumns() {
        try {
            localStorage.setItem('tweetWidgetDataViewer.visibleColumns', JSON.stringify(Array.from(this.visibleColumns)));
        } catch {}
    }

    private loadVisibleColumns() {
        try {
            const saved = localStorage.getItem('tweetWidgetDataViewer.visibleColumns');
            if (saved) {
                this.visibleColumns = new Set(JSON.parse(saved));
            }
        } catch {}
    }
} 