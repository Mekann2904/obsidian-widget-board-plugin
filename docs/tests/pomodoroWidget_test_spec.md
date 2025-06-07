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