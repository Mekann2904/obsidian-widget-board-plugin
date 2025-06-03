// src/widgetRegistry.ts
import type { WidgetImplementation } from './interfaces';
import { PomodoroWidget } from './widgets/pomodoroWidget';
import { MemoWidget } from './widgets/memoWidget';
import { CalendarWidget } from './widgets/calendarWidget';
import { RecentNotesWidget } from './widgets/recentNotesWidget';
import { ThemeSwitcherWidget } from './widgets/themeSwitcherWidget';
import { TimerStopwatchWidget } from './widgets/timerStopwatchWidget';
import { FileViewWidget } from './widgets/FileViewWidget';
import { TweetWidget } from './widgets/tweetWidget/tweetWidget';
import { ReflectionWidget } from './widgets/reflectionWidget/reflectionWidget';

export const registeredWidgetImplementations: Map<string, new () => WidgetImplementation> = new Map();

// 各ウィジェットを登録
registeredWidgetImplementations.set('pomodoro', PomodoroWidget);
registeredWidgetImplementations.set('memo', MemoWidget);
registeredWidgetImplementations.set('calendar', CalendarWidget);
registeredWidgetImplementations.set('recent-notes', RecentNotesWidget);
registeredWidgetImplementations.set('theme-switcher', ThemeSwitcherWidget);
registeredWidgetImplementations.set('timer-stopwatch', TimerStopwatchWidget);
registeredWidgetImplementations.set('file-view-widget', FileViewWidget);
registeredWidgetImplementations.set('tweet-widget', TweetWidget);
registeredWidgetImplementations.set('reflection-widget', ReflectionWidget);

// 新しいウィジェットを追加する場合：
// 1. src/widgets/に新しいウィジェットファイルを作成 (例: newWidget.ts)
// 2. 上記で NewWidget をインポート
// 3. registeredWidgetImplementations.set('newWidgetType', new NewWidget()); のように登録