# RecentNotesWidget テスト仕様書

## 概要
- 対象: `src/widgets/recent-notes/index.ts` `RecentNotesWidget`
- 目的: 最近編集したノートウィジェットのUI・リスト表示・設定反映の仕様検証

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                 | 結果 | 備考 |
|-----|--------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・リスト生成                        | UI要素の生成・初期化                 |      |      |
| 2   | ノートなし時のメッセージ表示               | ノートがない場合のUI                 |      |      |
| 3   | ノートリストのmtime降順描画                | 並び順・内容の正しさ                 |      |      |
| 4   | ノート名クリックでopenLinkText呼び出し      | ノートリンク動作                     |      |      |
| 5   | maxNotes設定で表示件数制限                 | 設定反映・リスト件数                  |      |      |
| 6   | updateExternalSettingsでmaxNotes反映        | 外部設定変更の反映                    |      |      |

---

## 各テストケース詳細

### 1. DOM構造・リスト生成
- **テスト対象**: `RecentNotesWidget.create`
- **目的**: recent-notes-widgetクラスやリストが正しく生成されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: recent-notes-widgetクラスとrecent-notes-listがDOM上に存在する
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOMを検証
- **実施結果記録**:

---

### 2. ノートなし時のメッセージ表示
- **テスト対象**: `RecentNotesWidget.create`, `renderNotesList`
- **目的**: ノートが存在しない場合に「最近編集したノートがありません」と表示されるか
- **前提条件**: getFilesが空配列を返すようにモック
- **入力値・操作**: create後、textContentを確認
- **期待結果**: 「最近編集したノートがありません」と表示される
- **手順**:
  1. getFilesを空配列返却にモック
  2. create呼び出し
  3. textContentを検証
- **実施結果記録**:

---

### 3. ノートリストのmtime降順描画
- **テスト対象**: `RecentNotesWidget.create`, `renderNotesList`
- **目的**: ノートリストがmtime降順で正しく描画されるか
- **前提条件**: getFilesで複数ノートを返す
- **入力値・操作**: create後、recent-note-itemの順序を確認
- **期待結果**: mtimeが大きい順に並ぶ
- **手順**:
  1. getFilesで複数ノートを返す
  2. create呼び出し
  3. recent-note-itemの順序を検証
- **実施結果記録**:

---

### 4. ノート名クリックでopenLinkText呼び出し
- **テスト対象**: ノートリンクのクリックイベント
- **目的**: ノート名クリックでopenLinkTextが正しい引数で呼ばれるか
- **前提条件**: ケース3と同じ
- **入力値・操作**: ノート名リンクをクリック
- **期待結果**: openLinkTextが正しい引数で呼ばれる
- **手順**:
  1. create呼び出し
  2. ノート名リンクをクリック
  3. openLinkTextの呼び出しを検証
- **実施結果記録**:

---

### 5. maxNotes設定で表示件数制限
- **テスト対象**: `RecentNotesWidget.create`, `renderNotesList`
- **目的**: maxNotes設定でリスト件数が制限されるか
- **前提条件**: getFilesで複数ノートを返す
- **入力値・操作**: maxNotesを1に設定しcreate呼び出し
- **期待結果**: recent-note-itemの件数が1になる
- **手順**:
  1. maxNotes=1に設定
  2. create呼び出し
  3. recent-note-itemの件数を検証
- **実施結果記録**:

---

### 6. updateExternalSettingsでmaxNotes反映
- **テスト対象**: `RecentNotesWidget.updateExternalSettings`
- **目的**: updateExternalSettingsでmaxNotesが反映されるか
- **前提条件**: ケース5と同じ
- **入力値・操作**: updateExternalSettingsでmaxNotesを1に変更
- **期待結果**: currentSettings.maxNotesが1、recent-note-itemの件数が1
- **手順**:
  1. create呼び出し
  2. updateExternalSettingsでmaxNotes=1に変更
  3. currentSettings.maxNotesとrecent-note-itemの件数を検証
- **実施結果記録**:

---

## 進捗・メモ

- [ ] ケース1 実施済み
- [ ] ケース2 未実施
- [ ] ケース3 未実施
- [ ] ケース4 未実施
- [ ] ケース5 未実施
- [ ] ケース6 未実施 