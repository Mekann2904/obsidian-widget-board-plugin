// ReflectionWidget用 型定義（必要に応じて拡張）
export interface ReflectionWidgetSettings {
    // 例: 表示期間や集計オプションなど
    period?: 'today' | 'week';
    aiSummaryAutoEnabled?: boolean; // 自動発火ON/OFF
    aiSummaryAutoIntervalHours?: number; // 自動発火間隔（時間、-1で無効）
    aiSummaryManualEnabled?: boolean; // 手動発火ボタンON/OFF
} 