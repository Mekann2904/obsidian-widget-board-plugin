# ウィジェット関数テスト計画

## 共通方針
- 各ウィジェットの主要なpublicメソッド・ユーティリティ関数を網羅的にテストする
- 例外・エラーケースも含めて検証する
- DOM操作や副作用がある場合はJestのモックやスパイを活用
- テストは`__tests__`配下にウィジェットごとにファイル分割

---

## PomodoroWidget
- create: 正常にHTMLElementを返すか
- updateExternalSettings: 設定変更時の状態・UI反映
- タイマー制御系（start, pause, reset, next）: 状態遷移・残り時間の検証
- セッション記録・メモ連携の検証

## MemoWidget
- create: 正常にHTMLElementを返すか
- メモ内容の編集・保存・再描画の検証
- 高さ自動調整・固定モードの切替

## CalendarWidget
- create: 正常にHTMLElementを返すか
- updateExternalSettings: 設定変更時のカレンダー再描画
- 日付クリック・ノート作成/リンク動作

## RecentNotesWidget
- create: 正常にHTMLElementを返すか
- ノートリスト取得・表示・クリック動作
- 仮想リスト・差分更新の検証

## ThemeSwitcherWidget
- create: 正常にHTMLElementを返すか
- テーマ一覧取得・切替動作

## TimerStopwatchWidget
- create: 正常にHTMLElementを返すか
- タイマー/ストップウォッチ切替・カウント動作
- updateExternalSettings: 設定変更時の反映
- 通知音・音量設定の検証

## FileViewWidget
- create: 正常にHTMLElementを返すか
- ファイルリスト取得・表示・クリック動作
- フィルタ・ソート機能の検証

## TweetWidget
- create: 正常にHTMLElementを返すか
- 投稿・返信・編集・削除・リアクション（いいね/RT/ブクマ）
- タブ切替・期間/フィルタ切替
- ファイル添付・アバター取得
- AIリプライ生成・トリガー判定
- ユーティリティ関数（tweetWidgetUtils, aiReply等）の単体テスト

## ReflectionWidget
- create: 正常にHTMLElementを返すか
- 振り返り内容の追加・編集・保存
- 日付・カテゴリ・タグ操作

---

## 補足
- それぞれのウィジェットで独自にexportされている関数・クラスも個別にテスト対象とする
- テスト実装時は必要に応じてモック・スタブを活用 