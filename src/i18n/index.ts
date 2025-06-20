export type Language = 'ja' | 'en';

export const LANGUAGE_NAMES: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
};

// -----------------------------------------------------------------------------
// カテゴリ別 文字列定義
// -----------------------------------------------------------------------------

const COMMON_STRINGS = {
  show: { ja: '表示', en: 'Show' },
  hide: { ja: '非表示', en: 'Hide' },
  save: { ja: '保存', en: 'Save' },
  cancel: { ja: 'キャンセル', en: 'Cancel' },
  add: { ja: '追加', en: 'Add' },
  update: { ja: '更新', en: 'Update' },
  edit: { ja: '編集', en: 'Edit' },
  delete: { ja: '削除', en: 'Delete' },
  off: { ja: 'なし', en: 'Off' },
  beep: { ja: 'ビープ音', en: 'Beep' },
  bell: { ja: 'ベル', en: 'Bell' },
  chime: { ja: 'チャイム', en: 'Chime' },
  notSave: { ja: '保存しない', en: 'Do not save' },
  playSound: { ja: '音を聞く', en: 'Play sound' },
  addUser: { ja: '＋ ユーザー追加', en: '+ Add User' },
  left: { ja: '左', en: 'Left' },
  center: { ja: '中央', en: 'Center' },
  right: { ja: '右', en: 'Right' },
  auto: { ja: '自動（内容にfit）', en: 'Auto (fit to content)' },
  fixed: { ja: '固定', en: 'Fixed' },
  custom: { ja: 'カスタム', en: 'Custom' },
  allTime: { ja: '全期間', en: 'All Time' },
  today: { ja: '今日', en: 'Today' },
  oneDay: { ja: '1日', en: '1 Day' },
  threeDays: { ja: '3日', en: '3 Days' },
  oneWeek: { ja: '1週間', en: '1 Week' },
  oneMonth: { ja: '1ヶ月', en: '1 Month' },
  sunday: { ja: '日曜日', en: 'Sunday' },
  monday: { ja: '月曜日', en: 'Monday' },
  tuesday: { ja: '火曜日', en: 'Tuesday' },
  wednesday: { ja: '水曜日', en: 'Wednesday' },
  thursday: { ja: '木曜日', en: 'Thursday' },
  friday: { ja: '金曜日', en: 'Friday' },
  saturday: { ja: '土曜日', en: 'Saturday' },
  content: { ja: '内容', en: 'Content' },
} as const;

const SETTINGS_PANE_STRINGS = {
  settingTabHeading: { ja: 'ウィジェットボード設定', en: 'Widget Board Settings' },
  languageSetting: { ja: '表示言語', en: 'Language' },
  baseFolderGlobal: { ja: 'ベースフォルダ（グローバル）', en: 'Base Folder (Global)' },
  baseFolderGlobalDesc: {
    ja: '全ウィジェット共通のデータ保存先となるVault内のフォルダを指定します（例: myfolder）。\nこのフォルダ配下に各ウィジェットのデータやノートが保存されます。',
    en: 'Specify the folder in your Vault to save data for all widgets (e.g., myfolder). All widget data and notes will be saved under this folder.'
  },
  myfolderPlaceholder: { ja: 'myfolder', en: 'myfolder' },
  debugLog: { ja: 'デバッグログを有効にする', en: 'Enable Debug Log' },
  debugLogDesc: { ja: 'コンソールに開発用のデバッグ情報を出力します。', en: 'Output debug information to the console.' },
} as const;

const GLOBAL_SETTINGS_SECTIONS = {
  pomoGlobalSetting: { ja: 'ポモドーロ（グローバル設定）', en: 'Pomodoro (Global Settings)' },
  timerGlobalSetting: { ja: 'タイマー／ストップウォッチ（グローバル設定）', en: 'Timer/Stopwatch (Global Settings)' },
  llmGlobalSetting: { ja: 'LLM（グローバル設定）', en: 'LLM (Global Settings)' },
  tweetWidgetGlobalSettings: { ja: 'つぶやき（グローバル設定）', en: 'Tweet (Global Settings)' },
  calendarGlobalSetting: { ja: 'カレンダー（グローバル設定）', en: 'Calendar (Global Settings)' },
  boardManagement: { ja: 'ボード管理', en: 'Board Management' },
  boardGroupManagement: { ja: 'ボードグループ管理', en: 'Board Group Management' },
} as const;

const POMODORO_STRINGS = {
  addPomodoro: { ja: 'ポモドーロ追加', en: 'Add Pomodoro' },
  notificationSound: { ja: '通知音', en: 'Notification Sound' },
  notificationVolume: { ja: '通知音量', en: 'Notification Volume' },
  pomodoroNotificationSoundDesc: { ja: '全てのポモドーロタイマーで使う通知音（個別設定より優先）', en: 'Notification sound used for all Pomodoro timers (overrides individual settings)' },
  notificationVolumeDesc: { ja: '通知音の音量（0.0〜1.0）', en: 'Notification sound volume (0.0-1.0)' },
  exportFormat: { ja: 'エクスポート形式', en: 'Export Format' },
  exportFormatDesc: { ja: '全てのポモドーロタイマーで使うログ記録形式（個別設定より優先）', en: 'Log export format for all Pomodoro timers (overrides individual settings)' },
  openBoardOnPomodoroEnd: { ja: 'ポモドーロ終了時に該当ボードを自動で開く', en: 'Open the board automatically when Pomodoro ends' },
  pomodoroEndOpenBoardDesc: { ja: 'ONにすると、ポモドーロが終了したときにこのウィジェットが属するボードを自動で開きます。', en: 'If ON, the board containing this widget will open automatically when Pomodoro ends.' },
  autoStartNextPomodoroSession: { ja: 'ポモドーロ終了時に自動で次のセッションを開始', en: 'Automatically start the next session when Pomodoro ends' },
  pomodoroEndAutoNextDesc: { ja: 'ONにすると、ポモドーロが終了したときに自動で次のセッションを開始します。', en: 'If ON, the next session will start automatically when Pomodoro ends.' },
  workMinutes: { ja: '作業時間 (分)', en: 'Work Time (min)' },
  workMinutesDesc: { ja: 'ポモドーロの作業フェーズの時間。', en: 'The duration of the work phase of a pomodoro.' },
  shortBreakMinutes: { ja: '短い休憩 (分)', en: 'Short Break (min)' },
  shortBreakMinutesDesc: { ja: '短い休憩フェーズの時間。', en: 'The duration of the short break phase.' },
  longBreakMinutes: { ja: '長い休憩 (分)', en: 'Long Break (min)' },
  longBreakMinutesDesc: { ja: '長い休憩フェーズの時間。', en: 'The duration of the long break phase.' },
  pomodorosUntilLongBreak: { ja: 'サイクル数', en: 'Cycles' },
  pomodorosUntilLongBreakDesc: { ja: '長い休憩までの作業ポモドーロ回数。', en: 'The number of pomodoros before a long break.' },
  backgroundImageUrl: { ja: '背景画像URL', en: 'Background Image URL' },
  backgroundImageUrlDesc: { ja: 'タイマーの背景として表示する画像のURL。', en: 'The URL of the image to display as the timer background.' },
  backgroundImageUrlPlaceholder: { ja: '例: https://example.com/image.jpg', en: 'e.g. https://example.com/image.jpg' },
  notificationAndExport: { ja: '通知音・エクスポート形式', en: 'Notification/Export' },
  notificationAndExportDesc: { ja: 'このウィジェットの通知音・エクスポート形式は「ポモドーロ（グローバル設定）」が適用されます。', en: 'The notification sound and export format for this widget are applied from "Pomodoro (Global Settings)".' },
} as const;

const MEMO_STRINGS = {
  addMemo: { ja: 'メモ追加', en: 'Add Memo' },
  memoContent: { ja: 'メモ内容 (Markdown)', en: 'Memo Content (Markdown)' },
  memoContentDesc: { ja: 'メモウィジェットに表示する内容。ウィジェット内でも編集できます。', en: 'The content to display in the memo widget. It can also be edited within the widget.' },
  memoContentPlaceholder: { ja: 'ここにメモを記述...', en: 'Write your memo here...' },
  memoHeightMode: { ja: '高さモード', en: 'Height Mode' },
  memoHeightModeDesc: { ja: '自動調整（内容にfit）または固定高さを選択', en: 'Select auto-fit to content or fixed height' },
  fixedHeightPx: { ja: '固定高さ(px)', en: 'Fixed Height (px)' },
  fixedHeightPxDesc: { ja: '固定モード時の高さ（px）', en: 'Height in fixed mode (px)' },
} as const;

const CALENDAR_STRINGS = {
  addCalendar: { ja: 'カレンダー追加', en: 'Add Calendar' },
  weekStartDay: { ja: '週の開始曜日', en: 'Start of the week' },
  weekStartDayDesc: { ja: 'カレンダーや要約の週範囲に使用する開始曜日です。', en: 'The starting day of the week for calendars and summaries.' },
  dailyNoteFormat: { ja: 'デイリーノートファイル名フォーマット', en: 'Daily Note Filename Format' },
  dailyNoteFormatDesc: { ja: '例: YYYY-MM-DD, YYYY-MM-DD.md など。YYYY, MM, DDが日付に置換されます。Moment.jsのフォーマットリファレンス（https://momentjs.com/docs/#/displaying/format/）に準拠。', en: 'e.g. YYYY-MM-DD, YYYY-MM-DD.md. YYYY, MM, DD will be replaced with the date. Compliant with Moment.js format reference (https://momentjs.com/docs/#/displaying/format/).' },
} as const;

const RECENT_NOTES_STRINGS = {
  addRecentNotes: { ja: '最近編集したノート', en: 'Add Recent Notes' },
} as const;

const THEME_SWITCHER_STRINGS = {
  addThemeSwitcher: { ja: 'テーマ切り替え', en: 'Add Theme Switcher' },
} as const;

const TIMER_STRINGS = {
  addTimerStopwatch: { ja: 'タイマー／ストップウォッチ', en: 'Add Timer/Stopwatch' },
  timerNotificationSoundDesc: { ja: '全てのタイマー／ストップウォッチで使う通知音（個別設定より優先）', en: 'Notification sound used for all timers/stopwatches (overrides individual settings)' },
} as const;

const FILE_VIEW_STRINGS = {
  addFileView: { ja: 'ファイルビューア追加', en: 'Add File Viewer' },
  filePath: { ja: 'ファイルパス', en: 'File Path' },
  filePathDesc: { ja: '表示するファイルのVault内パス', en: 'The path of the file to display within the Vault' },
} as const;

const TWEET_STRINGS = {
  addTweetWidget: { ja: 'つぶやき追加', en: 'Add Tweet' },
  userName: { ja: 'ユーザー名', en: 'User Name' },
  userId: { ja: 'ユーザーID', en: 'User ID' },
  avatarUrl: { ja: 'アバターURL', en: 'Avatar URL' },
  userListGlobal: { ja: 'ユーザー一覧（グローバル）', en: 'User List (Global)' },
  aiReplyTriggerless: { ja: 'AIリプライをトリガーワードなしでも自動発火させる', en: 'Trigger AI reply even without trigger word' },
  aiReplyRpm: { ja: 'AIリプライの1分あたり発火上限（RPM）', en: 'AI Reply Max per Minute (RPM)' },
  aiReplyRpmDesc: { ja: '-1で無制限。0は発火しません。', en: '-1: unlimited. 0: no reply.' },
  aiReplyRpd: { ja: 'AIリプライの1日あたり発火上限（RPD）', en: 'AI Reply Max per Day (RPD)' },
  aiReplyRpdDesc: { ja: '-1で無制限。0は発火しません。', en: '-1: unlimited. 0: no reply.' },
  unlimitedPlaceholder: { ja: '-1（無制限）', en: '-1 (Unlimited)' },
  userIconUrl: { ja: 'ユーザーアイコンURL', en: 'User Icon URL' },
  userIconUrlDesc: { ja: 'つぶやきウィジェットで使うアバター画像のURLを指定してください（例: https://.../avatar.png）', en: 'Specify the URL of the avatar image to use in the tweet widget (e.g., https://.../avatar.png)' },
  showAiHistory: { ja: 'AIの会話履歴を表示', en: 'Show AI Conversation History' },
  showAiHistoryDesc: { ja: 'AIリプライの下に会話履歴を表示する（デフォルト: オフ）', en: 'Show conversation history below AI replies (default: off)' },
  aiAvatarUrls: { ja: 'AIアバター画像URLリスト', en: 'AI Avatar Image URL List' },
  aiAvatarUrlsDesc: { ja: 'AIごとに使い分けるアバター画像のURLをカンマ区切りで指定（例: https://.../ai1.png, https://.../ai2.png）', en: 'Specify comma-separated avatar image URLs for each AI (e.g., https://.../ai1.png, https://.../ai2.png)' },
  aiReplyDelayMin: { ja: 'AIリプライの最小遅延（ms）', en: 'AI Reply Minimum Delay (ms)' },
  aiReplyDelayMinDesc: { ja: 'AIリプライを送るまでの最小待機時間（ミリ秒）。例: 1500 = 1.5秒', en: 'Minimum waiting time before sending an AI reply (milliseconds). e.g., 1500 = 1.5 seconds' },
  aiReplyDelayMax: { ja: 'AIリプライの最大遅延（ms）', en: 'AI Reply Maximum Delay (ms)' },
  aiReplyDelayMaxDesc: { ja: 'AIリプライを送るまでの最大待機時間（ミリ秒）。例: 7000 = 7秒', en: 'Maximum waiting time before sending an AI reply (milliseconds). e.g., 7000 = 7 seconds' },
  tweetDefaultPeriod: { ja: 'つぶやきウィジェットのデフォルト表示期間', en: 'Default Display Period for Tweet Widget' },
  tweetDefaultPeriodDesc: { ja: 'つぶやきウィジェットを開いたときに最初に表示される期間を選択できます。', en: 'Select the initial display period when opening the tweet widget.' },
  tweetDefaultCustomDays: { ja: 'つぶやきウィジェットのカスタム期間（日数）', en: 'Custom Period for Tweet Widget (days)' },
  tweetDefaultCustomDaysDesc: { ja: 'デフォルト期間が「カスタム」の場合に使われます。', en: 'Used when the default period is "Custom".' },
  addScheduledTweet: { ja: '予約投稿を追加', en: 'Add Scheduled Tweet' },
  addScheduledTweetDesc: { ja: '指定した日時に自動投稿するメッセージを登録します', en: 'Register a message to be automatically posted at the specified date and time.' },
  editScheduledTweet: { ja: '予約投稿を編集', en: 'Edit Scheduled Tweet' },
  userIdSelectDesc: { ja: 'グローバル設定で登録したユーザーから選択', en: 'Select from users registered in global settings' },
  time: { ja: '時刻', en: 'Time' },
  timeDesc: { ja: '例: 09:00（24時間表記）', en: 'e.g. 09:00 (24-hour format)' },
  daysOfWeek: { ja: '曜日', en: 'Days of the week' },
  daysOfWeekDesc: { ja: '投稿する曜日を選択（複数可）', en: 'Select the day(s) of the week to post (multiple selections allowed)' },
  startDate: { ja: '開始日', en: 'Start Date' },
  startDateDesc: { ja: 'この日以降に投稿（空欄で無期限）', en: 'Post on or after this date (indefinite if blank)' },
  endDate: { ja: '終了日', en: 'End Date' },
  endDateDesc: { ja: 'この日まで投稿（空欄で無期限）', en: 'Post until this date (indefinite if blank)' },
  aiPrompt: { ja: 'AIプロンプト', en: 'AI Prompt' },
  aiPromptDesc: { ja: '投稿時にAIで内容を自動生成したい場合にプロンプトを記入。{{ai}}で内容欄に埋め込まれます。', en: 'Enter a prompt if you want to auto-generate content with AI when posting. {{ai}} will be embedded in the content.' },
  aiModel: { ja: 'AIモデル', en: 'AI Model' },
  aiModelDesc: { ja: 'AIプロンプト実行時に使うモデル。空欄でグローバル設定のつぶやき返信用モデルを使用', en: 'The model to use when executing the AI prompt. If blank, the global tweet reply model will be used.' },
  scheduledTweetUpdated: { ja: '予約投稿を更新しました', en: 'Scheduled tweet updated' },
  scheduledTweetAdded: { ja: '予約投稿を追加しました', en: 'Scheduled tweet added' },
  scheduledPostList: { ja: '予約投稿一覧', en: 'Scheduled Posts' },
  noScheduledPosts: { ja: '現在、予約投稿はありません。', en: 'No scheduled posts.' },
  deleteScheduledPostConfirm: { ja: 'この予約投稿を削除しますか？', en: 'Delete this scheduled post?' },
  scheduledPostDeleted: { ja: '予約投稿を削除しました', en: 'Scheduled post deleted' },
} as const;

const REFLECTION_WIDGET_STRINGS = {
  addReflectionWidget: { ja: '振り返りレポート', en: 'Add Reflection Report' },
  autoTriggerInterval: { ja: '自動発火の間隔（時間）', en: 'Auto-trigger Interval (hours)' },
  autoTriggerIntervalDesc: { ja: '-1で自動発火しません。1以上で何時間ごとに自動生成するか指定。', en: '-1 to disable auto-trigger. Specify how many hours to auto-generate.' },
  showManualTrigger: { ja: '手動発火ボタンを表示', en: 'Show Manual Trigger Button' },
  showManualTriggerDesc: { ja: 'ONにすると、ウィジェット内に「まとめ生成」ボタンが表示されます。', en: 'If ON, a "Generate Summary" button will be displayed in the widget.' },
} as const;

const LLM_STRINGS = {
  geminiApiKey: { ja: 'Gemini APIキー', en: 'Gemini API Key' },
  geminiApiKeyDesc: { ja: 'Google Gemini APIのキーを入力してください。', en: 'Enter your Google Gemini API key.' },
  llmModelName: { ja: 'モデル名', en: 'Model Name' },
  llmModelNameExample: { ja: '例: gemini-2.0-flash-exp', en: 'e.g., gemini-2.0-flash-exp' },
  enterCustomPrompt: { ja: 'カスタムプロンプトを入力', en: 'Enter custom prompt' },
  tweetAiModelName: { ja: 'つぶやきAI返信用モデル名', en: 'Tweet AI Reply Model Name' },
  tweetAiModelNameDesc: { ja: '空欄の場合は上記モデル名を使用', en: 'If empty, the above model name will be used.' },
  reflectionAiModelName: { ja: '振り返りAI要約用モデル名', en: 'Reflection AI Summary Model Name' },
  reflectionAiModelNameDesc: { ja: '空欄の場合は上記モデル名を使用', en: 'If empty, the above model name will be used.' },
  userSummaryPromptToday: { ja: 'ユーザプロンプト（振り返りレポート 今日用）', en: 'User Prompt (Reflection Report Today)' },
  userSummaryPromptTodayDesc: { ja: 'AI要約で使うカスタムプロンプト（今日のまとめ）。{posts}が投稿一覧に置換されます。空欄の場合はデフォルトプロンプトが使われます。', en: 'Custom prompt for AI summary (today summary). {posts} will be replaced with the post list. If empty, the default prompt will be used.' },
  userSummaryPromptWeek: { ja: 'ユーザプロンプト（振り返りレポート 今週用）', en: 'User Prompt (Reflection Report This Week)' },
  userSummaryPromptWeekDesc: { ja: 'AI要約で使うカスタムプロンプト（今週のまとめ）。{posts}が投稿一覧に置換されます。空欄の場合はデフォルトプロンプトが使われます。', en: 'Custom prompt for AI summary (this week summary). {posts} will be replaced with the post list. If empty, the default prompt will be used.' },
  userTweetPrompt: { ja: 'ユーザプロンプト（つぶやき用）', en: 'User Prompt (Tweet)' },
  userTweetPromptDesc: { ja: 'つぶやきウィジェットのAI返信で使うカスタムプロンプト。{tweet}や{postDate}が投稿内容・日時に置換されます。空欄の場合はデフォルトプロンプトが使われます。', en: 'Custom prompt for AI reply in the tweet widget. {tweet} and {postDate} will be replaced with the post content and date. If empty, the default prompt will be used.' },
} as const;

const BOARD_MANAGEMENT_STRINGS = {
  boardSelect: { ja: 'ボード選択', en: 'Select Board' },
  boardSelectDesc: { ja: '設定を編集するウィジェットボードを選択してください。', en: 'Select the widget board to edit its settings.' },
  noBoards: { ja: '利用可能なボードがありません。「ボード管理」から新しいボードを追加してください。', en: 'No boards available. Please add a new board from "Board Management".' },
  selectBoardToConfig: { ja: '設定するボードを「ボード管理」から選択してください。', en: 'Please select a board to configure from "Board Management".' },
  noBoardsAvailable: { ja: '利用可能なボードがありません', en: 'No boards available' },
  addNewBoard: { ja: '新しいボードを追加', en: 'Add New Board' },
  defaultViewMode: { ja: 'デフォルト表示モード', en: 'Default View Mode' },
  defaultViewModeDesc: { ja: 'このボードを開いたときの初期表示モード。', en: 'The initial view mode when opening this board.' },
  leftPanel33: { ja: '左パネル（33vw）', en: 'Left Panel (33vw)' },
  leftPanel50: { ja: '左パネル（50vw）', en: 'Left Panel (50vw)' },
  leftPanel66: { ja: '左パネル（66vw）', en: 'Left Panel (66vw)' },
  leftSplitOuter: { ja: '左スプリット外（32vw）', en: 'Outside Left Split (32vw)' },
  centerPanel33: { ja: '中央パネル（33vw）', en: 'Center Panel (33vw)' },
  centerPanel50: { ja: '中央パネル（50vw）', en: 'Center Panel (50vw)' },
  rightPanel33: { ja: '右パネル（33vw）', en: 'Right Panel (33vw)' },
  rightPanel50: { ja: '右パネル（50vw）', en: 'Right Panel (50vw)' },
  rightPanel66: { ja: '右パネル（66vw）', en: 'Right Panel (66vw)' },
  rightSplitOuter: { ja: '右スプリット外（32vw）', en: 'Outside Right Split (32vw)' },
  customWidthVw: { ja: 'カスタム幅（vw）', en: 'Custom Width (vw)' },
  boardName: { ja: 'ボード名', en: 'Board Name' },
  boardNameDesc: { ja: 'このボードの名前を入力してください。', en: 'Enter the name of this board.' },
  customWidth: { ja: 'カスタム幅（vw）', en: 'Custom Width (vw)' },
  customWidthDesc: { ja: 'パネルの幅をvw単位で指定します（例: 40）', en: 'Specify the panel width in vw units (e.g., 40)' },
  customWidthPlaceholder: { ja: '例: 40', en: 'e.g., 40' },
  customWidthAnchor: { ja: 'カスタム幅の基準位置', en: 'Custom Width Anchor' },
  customWidthAnchorDesc: { ja: 'カスタム幅パネルの表示基準（左・中央・右）', en: 'Display anchor for custom width panel (left, center, right)' },
  deleteThisBoard: { ja: 'このボードを削除', en: 'Delete this board' },
  deleteBoardConfirm: { ja: 'ボード「{name}」を本当に削除しますか？', en: 'Are you sure you want to delete the board "{name}"?' },
} as const;

const WIDGET_MANAGEMENT_STRINGS = {
  widgetManagement: { ja: 'ウィジェット管理', en: 'Widget Management' },
  addWidget: { ja: '追加', en: 'Add' },
  noWidgets: { ja: 'このボードにはウィジェットがありません。「追加」ボタンで作成できます。', en: 'There are no widgets on this board. You can create one with the "Add" button.' },
  moveUp: { ja: '上に移動', en: 'Move Up' },
  moveDown: { ja: '下に移動', en: 'Move Down' },
  deleteWidget: { ja: 'このウィジェットを削除', en: 'Delete this widget' },
  widgetType: { ja: '種類', en: 'Type' },
  widgetId: { ja: 'ID', en: 'ID' },
  widgetNamePlaceholder: { ja: '(ウィジェット名)', en: '(Widget Name)' },
  untitledWidget: { ja: '(名称未設定 {type})', en: '(Untitled {type})' },
  widgetAddedToBoard: { ja: '「{widgetName}」ウィジェットがボード「{boardName}」に追加されました。', en: 'Widget "{widgetName}" has been added to board "{boardName}".' },
  widgetDeletedFromBoard: { ja: 'ウィジェット「{widgetName}」をボード「{boardName}」から削除しました。', en: 'Widget "{widgetName}" has been deleted from board "{boardName}".' },
  detailedSettings: { ja: '詳細設定', en: 'Detailed Settings' },
} as const;

const BOARD_GROUP_STRINGS = {
  boardGroupManagementDesc: { ja: '複数のボードをグループ化してコマンドで一括表示できます。', en: 'Group multiple boards to display them all at once with a command.' },
  addNewGroup: { ja: '新しいグループを追加', en: 'Add New Group' },
  noGroups: { ja: 'グループがありません。', en: 'No groups.' },
  editGroup: { ja: 'グループを編集', en: 'Edit Group' },
  deleteGroup: { ja: 'グループを削除', en: 'Delete Group' },
  deleteGroupConfirm: { ja: 'グループ「{name}」を本当に削除しますか？', en: 'Are you sure you want to delete the group "{name}"?' },
  groupName: { ja: 'グループ名', en: 'Group Name' },
  groupNameDesc: { ja: 'コマンドパレットに表示される名前です。', en: 'The name displayed in the command palette.' },
  groupNamePlaceholder: { ja: '例: 私の作業スペース', en: 'e.g. My Workspace' },
  selectBoards: { ja: 'ボードを選択', en: 'Select Boards' },
  selectBoardsDesc: { ja: 'グループに含めるボードを選択してください。', en: 'Select the boards to include in the group.' },
  enterGroupName: { ja: 'グループ名を入力してください', en: 'Please enter a group name' },
  selectOneBoardAtLeast: { ja: '1つ以上のボードを選択してください', en: 'Please select at least one board' },
} as const;

const ERROR_MESSAGES = {
  vaultRelativePathOnly: { ja: 'Vault内の相対パスのみ指定できます。絶対パスやVault外は不可です。', en: 'Only relative paths within the Vault are allowed. Absolute paths or outside the Vault are not permitted.' },
  invalidNumber: { ja: '数値を入力してください（vw単位）', en: 'Please enter a number (vw units)' },
  rangeWarning: { ja: '1〜100の範囲でvwを指定することを推奨します。', en: 'It is recommended to specify vw in the range of 1 to 100.' },
  enterPositiveNumber: { ja: '1以上の半角数値を入力してください。', en: 'Please enter a positive number.' },
  invalidTimeFormat: { ja: '時刻は00:00〜23:59の形式で入力してください', en: 'Please enter the time in 00:00-23:59 format' },
  enterContent: { ja: '内容を入力してください', en: 'Please enter the content' },
  cannotCalculateNextPost: { ja: '次の投稿日時が計算できません', en: 'Cannot calculate the next post time' },
} as const;


// -----------------------------------------------------------------------------
// 型定義とt関数
// -----------------------------------------------------------------------------

const STRINGS = {
  ...COMMON_STRINGS,
  ...SETTINGS_PANE_STRINGS,
  ...GLOBAL_SETTINGS_SECTIONS,
  ...POMODORO_STRINGS,
  ...MEMO_STRINGS,
  ...CALENDAR_STRINGS,
  ...RECENT_NOTES_STRINGS,
  ...THEME_SWITCHER_STRINGS,
  ...TIMER_STRINGS,
  ...FILE_VIEW_STRINGS,
  ...TWEET_STRINGS,
  ...REFLECTION_WIDGET_STRINGS,
  ...LLM_STRINGS,
  ...BOARD_MANAGEMENT_STRINGS,
  ...WIDGET_MANAGEMENT_STRINGS,
  ...BOARD_GROUP_STRINGS,
  ...ERROR_MESSAGES,
};

export type StringKey = keyof typeof STRINGS;

export function t(
  lang: Language,
  key: StringKey,
  vars?: Record<string, string | number>
): string {
  const v = STRINGS[key] as { ja: string; en: string } | undefined;
  if (!v) {
    // console.warn(`Translation key not found: ${key}`);
    return key;
  }
  let str = v[lang] ?? v.ja;
  if (vars) {
    Object.entries(vars).forEach(([k, val]) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    });
  }
  return str;
}

// -----------------------------------------------------------------------------
// ウィジェット名
// -----------------------------------------------------------------------------

const WIDGET_TYPE_NAMES = {
  ja: {
    'pomodoro': 'ポモドーロタイマー',
    'memo': 'メモ',
    'timer-stopwatch': 'タイマー/ストップウォッチ',
    'calendar': 'カレンダー',
    'recent-notes': '最近編集したノート',
    'theme-switcher': 'テーマ切り替え',
    'file-view-widget': 'ファイルビューア',
    'tweet-widget': 'つぶやき',
    'reflection-widget': '振り返りレポート',
  },
  en: {
    'pomodoro': 'Pomodoro Timer',
    'memo': 'Memo',
    'timer-stopwatch': 'Timer/Stopwatch',
    'calendar': 'Calendar',
    'recent-notes': 'Recent Notes',
    'theme-switcher': 'Theme Switcher',
    'file-view-widget': 'File Viewer',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Reflection Report',
  },
} as const;

export type WidgetTypeKey = keyof typeof WIDGET_TYPE_NAMES['ja'];

export function widgetTypeName(lang: Language, type: WidgetTypeKey | string): string {
  // `type` might be a string that is not a WidgetTypeKey, so we need to handle that.
  if (lang in WIDGET_TYPE_NAMES && type in WIDGET_TYPE_NAMES[lang]) {
    return WIDGET_TYPE_NAMES[lang][type as WidgetTypeKey];
  }
  return type;
}
