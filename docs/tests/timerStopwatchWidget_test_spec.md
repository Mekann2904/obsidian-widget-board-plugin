# TimerStopwatchWidget テスト仕様書

## 概要
- 対象: `src/widgets/timer-stopwatch/index.ts` `TimerStopwatchWidget`
- 目的: タイマー/ストップウォッチウィジェットのUI・動作・設定反映・異常系の仕様検証

---

## テストケース一覧

| No. | テスト内容                                         | 目的                                 | 結果 | 備考 |
|-----|----------------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・クラス・タイトルの付与                    | UI要素・タイトルの正しい表示         |      |      |
| 2   | UI要素（モード切替・入力欄・表示・ボタン）の生成    | 必要なUI部品が揃っているか           |      |      |
| 3   | モード切替でUIとstateが切り替わる                   | タイマー/ストップウォッチ切替         |      |      |
| 4   | スタート/一時停止ボタンでrunningが切り替わる        | 動作状態の切替                       |      |      |
| 5   | リセットボタンで残り時間・経過時間が初期化される    | リセット動作の正しさ                 |      |      |
| 6   | 入力欄のバリデーション（最大・最小値）              | 入力値の制約・UI反映                 |      |      |
| 7   | handleTimerSettingsChangeでstateとUIが更新される     | 入力値変更の反映                     |      |      |
| 8   | playSoundNotificationで通知音が再生される           | 通知音再生の副作用                   |      |      |
| 9   | updateExternalSettingsでtimerMinutes/Seconds反映     | 外部設定反映                         |      |      |
| 10  | state未定義時もupdateDisplayでエラーにならない      | 異常系の安全性                       |      |      |
| 11  | ウィジェットの削除                                 | クリーンアップ・復元不可              |      |      |
| 12  | ウィジェットの並べ替え                             | DOM順序・保存順序の維持               |      |      |

---

## 各テストケース詳細

### 1. DOM構造・クラス・タイトルの付与
- **テスト対象**: `TimerStopwatchWidget.create`
- **目的**: timer-stopwatch-widgetクラスやタイトルが正しく付与されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: .timer-stopwatch-widgetクラスとタイトルが表示される
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOM構造・タイトルを検証
- **実施結果記録**:

---

### 2. UI要素（モード切替・入力欄・表示・ボタン）の生成
- **テスト対象**: `TimerStopwatchWidget.create`, `buildUI`
- **目的**: 必要なUI部品が揃っているか
- **前提条件**: ケース1と同じ
- **入力値・操作**: create呼び出し
- **期待結果**: 各UI要素が生成されている
- **手順**:
  1. create呼び出し
  2. 各要素の存在を検証
- **実施結果記録**:

---

### 3. モード切替でUIとstateが切り替わる
- **テスト対象**: `handleSwitchMode`
- **目的**: タイマー/ストップウォッチ切替時のstate/UI反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: handleSwitchMode('stopwatch'/'timer')
- **期待結果**: state.modeが切り替わる
- **手順**:
  1. create呼び出し
  2. handleSwitchModeで切替
  3. state.modeを検証
- **実施結果記録**:

---

### 4. スタート/一時停止ボタンでrunningが切り替わる
- **テスト対象**: `handleToggleStartPause`
- **目的**: running状態の切替
- **前提条件**: ケース1と同じ
- **入力値・操作**: handleToggleStartPause呼び出し
- **期待結果**: runningがtrue/falseで切り替わる
- **手順**:
  1. create呼び出し
  2. handleToggleStartPauseを2回呼ぶ
  3. runningの変化を検証
- **実施結果記録**:

---

### 5. リセットボタンで残り時間・経過時間が初期化される
- **テスト対象**: `handleReset`, `resetGlobalTimer`
- **目的**: リセット時のstate初期化
- **前提条件**: ケース1と同じ
- **入力値・操作**: handleReset呼び出し
- **期待結果**: remainingSeconds/elapsedSecondsが初期化
- **手順**:
  1. create呼び出し
  2. handleToggleStartPauseで動作中に
  3. handleReset呼び出し
  4. stateを検証
- **実施結果記録**:

---

### 6. 入力欄のバリデーション（最大・最小値）
- **テスト対象**: `timerMinInput.oninput`, `timerSecInput.oninput`
- **目的**: 入力値の制約・UI反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: 入力欄に異常値を入力しoninput呼び出し
- **期待結果**: 0〜999, 0〜59に補正される
- **手順**:
  1. create呼び出し
  2. 入力欄に異常値を入力
  3. oninput呼び出し
  4. 値を検証
- **実施結果記録**:

---

### 7. handleTimerSettingsChangeでstateとUIが更新される
- **テスト対象**: `handleTimerSettingsChange`
- **目的**: 入力値変更時のstate/UI反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: 入力欄に値を入れhandleTimerSettingsChange呼び出し
- **期待結果**: state/入力欄が更新される
- **手順**:
  1. create呼び出し
  2. 入力欄に値を入力
  3. handleTimerSettingsChange呼び出し
  4. state/入力欄を検証
- **実施結果記録**:

---

### 8. playSoundNotificationで通知音が再生される
- **テスト対象**: `playSoundNotification`
- **目的**: 通知音再生の副作用
- **前提条件**: AudioContextをjest.fnでモック
- **入力値・操作**: playSoundNotification呼び出し
- **期待結果**: createOscillator等が呼ばれる
- **手順**:
  1. create呼び出し
  2. AudioContextをモック
  3. playSoundNotification呼び出し
  4. モック呼び出しを検証
- **実施結果記録**:

---

### 9. updateExternalSettingsでtimerMinutes/Seconds反映
- **テスト対象**: `updateExternalSettings`
- **目的**: 外部設定反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: updateExternalSettings呼び出し
- **期待結果**: currentSettings/入力欄が更新
- **手順**:
  1. create呼び出し
  2. updateExternalSettings呼び出し
  3. currentSettings/入力欄を検証
- **実施結果記録**:

---

### 10. state未定義時もupdateDisplayでエラーにならない
- **テスト対象**: `updateDisplay`
- **目的**: state未定義時の安全性
- **前提条件**: ケース1と同じ
- **入力値・操作**: widgetStatesからstateを削除しupdateDisplay呼び出し
- **期待結果**: エラーにならずError表示
- **手順**:
  1. create呼び出し
  2. widgetStatesからstate削除
  3. updateDisplay呼び出し
  4. Error表示を検証
- **実施結果記録**:

---

### 11. ウィジェットの削除
- **テスト対象**: `TimerStopwatchWidget`（削除UI、onunload）
- **目的**: ウィジェット削除時、インスタンス・state・DOMが正しくクリーンアップされるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: 削除操作を実行
- **期待結果**: インスタンス・state・DOMが削除され、再表示されない
- **手順**:
  1. create呼び出し
  2. 削除操作
  3. インスタンス・state・DOMの消失を検証
- **実施結果記録**:

---

### 12. ウィジェットの並べ替え
- **テスト対象**: `TimerStopwatchWidget`（並べ替えUI/イベント）
- **目的**: 並べ替えイベント発火時、ウィジェットのDOM順序・保存順序が正しく変わるか
- **前提条件**: 複数ウィジェットをボード上に配置
- **入力値・操作**: 並べ替え操作（ドラッグ&ドロップ等）
- **期待結果**: DOM順序・保存順序が変更され、再読み込み後も維持される
- **手順**:
  1. 複数ウィジェットを配置
  2. 並べ替え操作
  3. DOM順序・保存順序を検証
  4. 再読み込み後も順序が維持されていることを確認
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