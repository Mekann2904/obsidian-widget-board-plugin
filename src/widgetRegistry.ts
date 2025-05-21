// src/widgetRegistry.ts
import type { WidgetImplementation } from './interfaces';
import { PomodoroWidget } from './widgets/pomodoroWidget';
import { MemoWidget } from './widgets/memoWidget';
import { CalendarWidget } from './widgets/calendarWidget';
import { RecentNotesWidget } from './widgets/recentNotesWidget';

export const registeredWidgetImplementations: Map<string, new () => WidgetImplementation> = new Map();

// 各ウィジェットを登録
registeredWidgetImplementations.set('pomodoro', PomodoroWidget);
registeredWidgetImplementations.set('memo', MemoWidget);
registeredWidgetImplementations.set('calendar', CalendarWidget);
registeredWidgetImplementations.set('recent-notes', RecentNotesWidget);

// 新しいウィジェットを追加する場合：
// 1. src/widgets/に新しいウィジェットファイルを作成 (例: newWidget.ts)
// 2. 上記で NewWidget をインポート
// 3. registeredWidgetImplementations.set('newWidgetType', new NewWidget()); のように登録