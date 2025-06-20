import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type WidgetBoardPlugin from '../../main';
import type { PomodoroExportFormat, SessionLog } from './index';

export class PomodoroSessionLogger {
  constructor(private app: App, private plugin: WidgetBoardPlugin) {}

  async exportLogs(sessionLogs: SessionLog[], format: PomodoroExportFormat): Promise<void> {
    if (sessionLogs.length === 0) {
      new Notice('エクスポートするログがありません。');
      return;
    }

    let content = '';
    let ext = '';
    if (format === 'csv') ext = 'csv';
    else if (format === 'json') ext = 'json';
    else if (format === 'markdown') ext = 'md';
    else return;

    const pluginFolder = this.app.vault.configDir + '/plugins/' + this.plugin.manifest.id;
    const logsFolder = pluginFolder + '/logs';
    const filePath = logsFolder + `/pomodoro-log.${ext}`;
    let allLogs: SessionLog[] = [];
    try {
      const logsFolderExists = await this.app.vault.adapter.exists(logsFolder);
      if (!logsFolderExists) {
        await this.app.vault.adapter.mkdir(logsFolder);
      }
      const fileExists = await this.app.vault.adapter.exists(filePath);
      if (fileExists) {
        const existing = await this.app.vault.adapter.read(filePath);
        if (format === 'csv') {
          const lines = existing.split('\n').filter(l => l.trim() !== '');
          if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
              const [date, start, end, sessionType, memo] = lines[i].split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
              allLogs.push({
                date: date || '',
                start: start || '',
                end: end || '',
                sessionType: (sessionType as any) || 'work',
                memo: memo ? memo.replace(/^\"|\"$/g, '').replace(/\"\"/g, '"') : '',
              });
            }
          }
        } else if (format === 'json') {
          try {
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed)) allLogs = parsed; else allLogs = [];
          } catch {
            allLogs = [];
          }
        } else if (format === 'markdown') {
          const lines = existing.split('\n').filter(l => l.trim() !== '');
          if (lines.length > 2) {
            for (let i = 2; i < lines.length; i++) {
              const cols = lines[i].split('|').map(s => s.trim());
              if (cols.length >= 6) {
                let memo = cols.slice(5).join('|');
                memo = memo.replace(/^\|+/, '').replace(/\|+$/, '').trim();
                allLogs.push({
                  date: cols[1],
                  start: cols[2],
                  end: cols[3],
                  sessionType: (cols[4] as any) || 'work',
                  memo: memo,
                });
              }
            }
          }
        }
      }
      allLogs = allLogs.concat(sessionLogs);
      if (format === 'csv') {
        content = '\uFEFFdate,start,end,sessionType,memo\n' + allLogs.map(log => {
          const safeMemo = (log.memo || '').replace(/\r?\n/g, '\\n').replace(/\"/g, '""');
          return `${log.date},${log.start},${log.end},${log.sessionType},"${safeMemo}"`;
        }).join('\n');
      } else if (format === 'json') {
        content = JSON.stringify(allLogs, null, 2);
      } else if (format === 'markdown') {
        content = '| date | start | end | sessionType | memo |\n|---|---|---|---|---|\n' +
          allLogs.map(log => `| ${log.date} | ${log.start} | ${log.end} | ${log.sessionType} | ${(log.memo || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')} |`).join('\n');
      }
      await this.app.vault.adapter.write(filePath, content);
      new Notice(`ポモドーロログを ${filePath} に保存しました。`);
    } catch (e) {
      new Notice('ログのエクスポートに失敗しました');
      console.error('Error exporting session logs:', e);
    }
  }
}

export default PomodoroSessionLogger;
