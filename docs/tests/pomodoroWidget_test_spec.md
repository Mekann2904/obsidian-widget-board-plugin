# PomodoroWidget テスト仕様書

## 概要
- 対象: `src/widgets/pomodoro/index.ts` `PomodoroWidget`
- 目的: ポモドーロタイマーウィジェットのUI・タイマー・セッション・メモ・設定反映の仕様検証

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                 | 結果 | 備考 |
|-----|--------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・UI要素生成                        | UI要素の生成・初期化                 |      |      |
| 2   | startTimerでisRunningがtrue/UI更新         | タイマー開始・UI反映                 |      |      |
| 3   | pauseTimerでisRunningがfalse/UI更新        | タイマー停止・UI反映                 |      |      |
| 4   | resetTimerStateで残り時間初期化            | タイマーリセット                     |      |      |
| 5   | skipToNextSessionConfirmでセッション遷移    | セッション種別・サイクルの遷移        |      |      |
| 6   | handleSessionEndでisRunningがfalse/遷移     | セッション終了・次セッション進行      |      |      |
| 7   | メモ編集でmemoContentが更新される           | メモ機能の編集・保存                  |      |      |
| 8   | updateExternalSettingsで設定反映            | 外部設定変更の反映                    |      |      |
| 9   | getWidgetIdでconfig.idが返る                | ID取得の正しさ                        |      |      |
| 10  | onunloadでインスタンス削除                  | クリーンアップ                        |      |      |
| 11  | removePersistentInstanceで削除              | インスタンス管理                      |      |      |
| 12  | cleanupAllPersistentInstancesで全削除        | インスタンス一括管理                  |      |      |
| 13  | 背景画像設定のUI反映                        | backgroundImageUrl設定時のUI反映        |      |      |
| 14  | サイクル数リセット（2回連続リセットボタン押下） | リセットボタンを2回連続で押すとサイクル数が0にリセットされるか |      |      |

---

## 各テストケース詳細

### 1. DOM構造・UI要素生成
- **テスト対象**: `PomodoroWidget.create`
- **目的**: pomodoro-timer-widgetクラスや各UI要素が正しく生成されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: 各UI要素がDOM上に存在する
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOMを検証
- **実施結果記録**:

---

### 2. startTimerでisRunningがtrue/UI更新
- **テスト対象**: `PomodoroWidget.startTimer`
- **目的**: startTimerでisRunningがtrueになり、UIが「一時停止」表示になるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: startTimer呼び出し
- **期待結果**: isRunningがtrue、startPauseButtonのaria-labelが「一時停止」
- **手順**:
  1. create呼び出し
  2. startTimer呼び出し
  3. isRunningとボタン表示を検証
- **実施結果記録**:

---

### 3. pauseTimerでisRunningがfalse/UI更新
- **テスト対象**: `PomodoroWidget.pauseTimer`
- **目的**: pauseTimerでisRunningがfalseになり、UIが「開始」表示になるか
- **前提条件**: ケース2でstartTimer実行済み
- **入力値・操作**: pauseTimer呼び出し
- **期待結果**: isRunningがfalse、startPauseButtonのaria-labelが「開始」
- **手順**:
  1. create呼び出し
  2. startTimer呼び出し
  3. pauseTimer呼び出し
  4. isRunningとボタン表示を検証
- **実施結果記録**:

---

### 4. resetTimerStateで残り時間初期化
- **テスト対象**: `PomodoroWidget.resetTimerState`
- **目的**: resetTimerStateで残り時間が初期化されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: resetTimerState('work', true)呼び出し
- **期待結果**: remainingTimeがworkMinutes*60になる
- **手順**:
  1. create呼び出し
  2. remainingTimeを変更
  3. resetTimerState呼び出し
  4. remainingTimeを検証
- **実施結果記録**:

---

### 5. skipToNextSessionConfirmでセッション遷移
- **テスト対象**: `PomodoroWidget.skipToNextSessionConfirm`
- **目的**: skipToNextSessionConfirmでcurrentPomodoroSetが変化するか
- **前提条件**: ケース1と同じ
- **入力値・操作**: skipToNextSessionConfirm呼び出し
- **期待結果**: currentPomodoroSetが変化する
- **手順**:
  1. create呼び出し
  2. currentPomodoroSetを記録
  3. skipToNextSessionConfirm呼び出し
  4. currentPomodoroSetを検証
- **実施結果記録**:

---

### 6. handleSessionEndでisRunningがfalse/遷移
- **テスト対象**: `PomodoroWidget.handleSessionEnd`
- **目的**: handleSessionEndでisRunningがfalseになり、次セッションに進むか
- **前提条件**: ケース1と同じ
- **入力値・操作**: isRunning=trueにしてhandleSessionEnd呼び出し
- **期待結果**: isRunningがfalse
- **手順**:
  1. create呼び出し
  2. isRunning=trueに設定
  3. handleSessionEnd呼び出し
  4. isRunningを検証
- **実施結果記録**:

---

### 7. メモ編集でmemoContentが更新される
- **テスト対象**: `PomodoroWidget.renderMemo`
- **目的**: メモ編集でmemoContentが正しく更新されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: renderMemo('テストメモ内容')呼び出し
- **期待結果**: currentSettings.memoContentが新しい値になる
- **手順**:
  1. create呼び出し
  2. renderMemo呼び出し
  3. currentSettings.memoContentを検証
- **実施結果記録**:

---

### 8. updateExternalSettingsで設定反映
- **テスト対象**: `PomodoroWidget.updateExternalSettings`
- **目的**: updateExternalSettingsでworkMinutesやbackgroundImageUrl等が反映されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: updateExternalSettingsで各種値を変更
- **期待結果**: currentSettingsの各値が新しい値になる
- **手順**:
  1. create呼び出し
  2. updateExternalSettingsで値を変更
  3. currentSettingsを検証
- **実施結果記録**:

---

### 9. getWidgetIdでconfig.idが返る
- **テスト対象**: `PomodoroWidget.getWidgetId`
- **目的**: getWidgetIdでconfig.idが返るか
- **前提条件**: ケース1と同じ
- **入力値・操作**: getWidgetId呼び出し
- **期待結果**: config.idが返る
- **手順**:
  1. create呼び出し
  2. getWidgetId呼び出し
  3. 戻り値を検証
- **実施結果記録**:

---

### 10. onunloadでインスタンス削除
- **テスト対象**: `PomodoroWidget.onunload`
- **目的**: onunloadでwidgetInstancesからインスタンスが削除されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: onunload呼び出し
- **期待結果**: widgetInstancesからインスタンスが消える
- **手順**:
  1. create呼び出し
  2. onunload呼び出し
  3. widgetInstancesを検証
- **実施結果記録**:

---

### 11. removePersistentInstanceで削除
- **テスト対象**: `PomodoroWidget.removePersistentInstance`
- **目的**: removePersistentInstanceでwidgetInstancesからインスタンスが削除されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: removePersistentInstance呼び出し
- **期待結果**: widgetInstancesからインスタンスが消える
- **手順**:
  1. create呼び出し
  2. removePersistentInstance呼び出し
  3. widgetInstancesを検証
- **実施結果記録**:

---

### 12. cleanupAllPersistentInstancesで全削除
- **テスト対象**: `PomodoroWidget.cleanupAllPersistentInstances`
- **目的**: cleanupAllPersistentInstancesで全インスタンスが削除されるか
- **前提条件**: 複数インスタンスを生成
- **入力値・操作**: cleanupAllPersistentInstances呼び出し
- **期待結果**: widgetInstances.sizeが0になる
- **手順**:
  1. 複数インスタンスを生成
  2. cleanupAllPersistentInstances呼び出し
  3. widgetInstances.sizeを検証
- **実施結果記録**:

---

### 13. 背景画像設定のUI反映
- **テスト対象**: `PomodoroWidget.updateExternalSettings`/`applyBackground`
- **目的**: backgroundImageUrl設定時にウィジェットの背景画像が正しく反映・解除されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**:
  1. createで初期化
  2. updateExternalSettings({ backgroundImageUrl: 'https://example.com/bg.png' })
  3. updateExternalSettings({ backgroundImageUrl: '' })
- **期待結果**:
  - 設定時: widgetEl.classListに'has-background-image'が含まれ、style.backgroundImageがurl("...")になる
  - 解除時: 'has-background-image'が外れ、style.backgroundImageが空文字になる
- **手順**:
  1. create呼び出し
  2. 背景画像未設定状態を検証
  3. 背景画像を設定しUIを検証
  4. 背景画像を解除しUIを検証
- **実施結果記録**:

---

### 14. サイクル数リセット（2回連続リセットボタン押下）
- **テスト対象**: `PomodoroWidget.resetCurrentTimerConfirm`/`resetTimerState`
- **目的**: リセットボタンを2回連続で押すとサイクル数が0にリセットされるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**:
  1. createで初期化
  2. pomodorosCompletedInCycleを3にセット
  3. resetCurrentTimerConfirm()を1回呼ぶ
  4. resetCurrentTimerConfirm()をもう1回呼ぶ
- **期待結果**:
  - 1回目: サイクル数は維持される（3のまま）
  - 2回目: サイクル数が0にリセットされ、UI上も"0 / ..."と表示される
- **手順**:
  1. create呼び出し
  2. サイクル数を3にセット
  3. 1回目リセット後の値を検証
  4. 2回目リセット後の値とUIを検証
- **実施結果記録**:

---

# 単体テストケース（Unit Test Cases）

### 15. 通知音再生（正常系・異常系）
- **テスト対象**: `PomodoroWidget.playSoundNotification`
- **目的**: 通知音（default_beep, bell, chime, off）が正しく再生・停止されるか、異常時にエラーが出ないか
- **手順**:
  1. 各soundTypeでplaySoundNotificationを呼ぶ
  2. AudioContextやHTMLAudioElementの呼び出しをモックし、再生/停止/例外時の挙動を検証
- **期待結果**: 正常時はエラーなく再生、off時は何も起きない、異常時はNoticeとconsole.errorが呼ばれる
- **実施結果記録**:

---

### 16. セッションログ出力（各フォーマット）
- **テスト対象**: `PomodoroWidget.exportSessionLogs`
- **目的**: セッションログがCSV/JSON/Markdown形式で正しく出力・保存されるか
- **手順**:
  1. ダミーのsessionLogsをセット
  2. 各formatでexportSessionLogsを呼ぶ
  3. ファイル書き込みAPIの呼び出し内容を検証
- **期待結果**: 各フォーマットで内容・ファイル名が正しい
- **実施結果記録**:

---

### 17. メモ編集のキャンセル・保存動作
- **テスト対象**: `PomodoroWidget.renderMemo`/`PomodoroMemoWidget`
- **目的**: メモ編集→保存・キャンセル時に内容が正しく反映/復元されるか
- **手順**:
  1. メモ編集モードに切替
  2. 内容を変更し保存→currentSettings.memoContentが更新される
  3. 内容を変更しキャンセル→元の内容に戻る
- **期待結果**: 保存時は新内容、キャンセル時は元の内容
- **実施結果記録**:

---

# 統合テストケース（Integration Test Cases）

### 18. タイマーとメモの連携
- **テスト対象**: `PomodoroWidget.handleSessionEnd`/`sessionLogs`
- **目的**: セッション終了時に最新のメモ内容がログに記録されるか
- **手順**:
  1. メモを編集
  2. タイマーを進めてhandleSessionEndを呼ぶ
  3. sessionLogsのmemoが最新内容か確認
- **期待結果**: ログのmemoが最新内容
- **実施結果記録**:

---

### 19. 設定変更とタイマー動作の連携
- **テスト対象**: `PomodoroWidget.updateExternalSettings`/`startTimer`
- **目的**: タイマー動作中にworkMinutes等を変更した場合、タイマーやUIが正しくリセットされるか
- **手順**:
  1. startTimerでタイマー開始
  2. updateExternalSettingsでworkMinutes等を変更
  3. タイマー・UIの状態を検証
- **期待結果**: タイマーが新設定でリセットされ、UIも反映
- **実施結果記録**:

---

### 20. 複数ウィジェットインスタンスの独立性
- **テスト対象**: PomodoroWidgetの複数インスタンス
- **目的**: 複数のPomodoroWidgetが独立して動作・状態管理されるか
- **手順**:
  1. 2つ以上のウィジェットを生成
  2. それぞれでタイマー・メモ・サイクルを操作
  3. 相互に影響しないか検証
- **期待結果**: すべて独立して動作
- **実施結果記録**:

---

### 21. 外部設定変更の一括反映
- **テスト対象**: plugin.settings/複数ウィジェット
- **目的**: plugin.settings経由で複数ウィジェットの設定を一括変更した場合、全てのUI・状態が正しく反映されるか
- **手順**:
  1. 複数ウィジェットを生成
  2. plugin.settings経由で一括設定変更
  3. すべてのウィジェットのUI・状態を検証
- **期待結果**: 全ウィジェットに正しく反映
- **実施結果記録**:

---

# システムテストケース（System Test Cases）

### 22. ユーザー操作フロー全体（E2E）
- **テスト対象**: PomodoroWidget全体
- **目的**: ユーザーがウィジェット追加→タイマー開始→作業・休憩→メモ記入→サイクル完了まで一連の操作を行い、全てのUI・状態・ログが期待通りか
- **手順**:
  1. ウィジェット追加
  2. タイマー開始・作業・休憩・スキップ・リセット等を操作
  3. メモ記入
  4. サイクル完了まで繰り返し
  5. ログ・UI・状態を検証
- **期待結果**: すべての機能が一連の流れで正しく動作
- **実施結果記録**:

---

### 23. 設定保存・復元
- **テスト対象**: PomodoroWidget/Obsidian再起動
- **目的**: ウィジェット設定やメモ内容が保存され、Obsidian再起動後も正しく復元されるか
- **手順**:
  1. 設定・メモを編集
  2. 保存・再起動（または再生成）
  3. 設定・メモ・サイクル数等が復元されているか検証
- **期待結果**: すべての設定・内容が復元
- **実施結果記録**:

---

### 24. 通知・エクスポートの一連動作
- **テスト対象**: PomodoroWidget/セッション終了/エクスポート
- **目的**: セッション終了時の通知や、セッションログのエクスポート（CSV/JSON/Markdown）が正しく行われるか
- **手順**:
  1. タイマーを進めてセッション終了
  2. 通知表示・エクスポートファイル生成を検証
- **期待結果**: 通知が表示され、ファイルが正しく出力
- **実施結果記録**:

---

### 25. 異常系操作（不正値・多重操作）
- **テスト対象**: PomodoroWidget全体
- **目的**: 不正な設定値（例: workMinutes=0や負値）や、連打・多重操作時にエラーや不整合が発生しないか
- **手順**:
  1. 不正値を設定しcreate/updateExternalSettingsを呼ぶ
  2. ボタンを連打・多重操作
  3. エラーや不整合が発生しないか検証
- **期待結果**: エラーや不整合が発生しない
- **実施結果記録**:

---

## 進捗・メモ

- [ ] ケース1 実施済み
- [ ] ケース2 未実施
- [ ] ケース3 未実施
- [ ] ケース4 未実施
- [ ] ケース5 未実施
- [ ] ケース6 未実施
- [ ] ケース7 未実施
- [ ] ケース8 未実施
- [ ] ケース9 未実施
- [ ] ケース10 未実施
- [ ] ケース11 未実施
- [ ] ケース12 未実施
- [ ] ケース13 未実施
- [ ] ケース14 未実施
- [ ] ケース15 未実施
- [ ] ケース16 未実施
- [ ] ケース17 未実施
- [ ] ケース18 未実施
- [ ] ケース19 未実施
- [ ] ケース20 未実施
- [ ] ケース21 未実施
- [ ] ケース22 未実施
- [ ] ケース23 未実施
- [ ] ケース24 未実施
- [ ] ケース25 未実施 