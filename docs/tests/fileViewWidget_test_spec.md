# FileViewWidget テスト仕様書

## 概要
- 対象: `src/widgets/file-view/index.ts` `FileViewWidget`
- 目的: ファイルビューウィジェットのUI・ファイル表示・設定反映の仕様検証

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                 | 結果 | 備考 |
|-----|--------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・コントロール生成                  | UI要素の生成・初期化                 |      |      |
| 2   | ファイル名未指定時の表示                   | 未指定時のエラーメッセージ            |      |      |
| 3   | .md以外の拡張子指定時のエラー              | 拡張子エラーの表示                    |      |      |
| 4   | 存在しないファイル名指定時のエラー          | ファイル未発見時のエラーメッセージ     |      |      |
| 5   | Obsidianで開くボタンの動作                 | openLinkText呼び出し                  |      |      |
| 6   | 高さモード・pxの反映                       | updateExternalSettingsの反映          |      |      |
| 7   | ファイル名変更時のタイトル自動更新          | タイトルの自動反映                    |      |      |

---

## 各テストケース詳細

### 1. DOM構造・コントロール生成
- **テスト対象**: `FileViewWidget.create`
- **目的**: file-view-widgetクラスやコントロール（input, button, .file-content）が正しく生成されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: 各UI要素がDOM上に存在する
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOMを検証
- **実施結果記録**:

---

### 2. ファイル名未指定時の表示
- **テスト対象**: `FileViewWidget.create`, `loadFile`
- **目的**: ファイル名未指定時に「ファイルが選択されていません」と表示されるか
- **前提条件**: fileNameを空文字に設定
- **入力値・操作**: create後、fileContentElの内容を確認
- **期待結果**: 「ファイルが選択されていません」と表示される
- **手順**:
  1. fileNameを空文字に設定
  2. create呼び出し
  3. fileContentElの内容を検証
- **実施結果記録**:

---

### 3. .md以外の拡張子指定時のエラー
- **テスト対象**: `FileViewWidget.create`, `loadFile`
- **目的**: .md以外の拡張子指定時にエラーメッセージが表示されるか
- **前提条件**: fileNameを"test.txt"に設定
- **入力値・操作**: create後、fileContentElの内容を確認
- **期待結果**: 「Markdown（.md）ファイルのみ表示できます」と表示される
- **手順**:
  1. fileNameを"test.txt"に設定
  2. create呼び出し
  3. fileContentElの内容を検証
- **実施結果記録**:

---

### 4. 存在しないファイル名指定時のエラー
- **テスト対象**: `FileViewWidget.create`, `loadFile`
- **目的**: 存在しないファイル名指定時にエラーメッセージが表示されるか
- **前提条件**: getAbstractFileByPathがnullを返すようにモック
- **入力値・操作**: create後、fileContentElの内容を確認
- **期待結果**: 「ファイルが見つかりません」と表示される
- **手順**:
  1. getAbstractFileByPathをnull返却にモック
  2. fileNameを"notfound.md"に設定
  3. create呼び出し
  4. fileContentElの内容を検証
- **実施結果記録**:

---

### 5. Obsidianで開くボタンの動作
- **テスト対象**: `FileViewWidget.obsidianOpenButton`, `currentFile`, `workspace.openLinkText`
- **目的**: currentFileがセットされている場合、ボタン押下でopenLinkTextが呼ばれるか
- **前提条件**: currentFileにTFile型ダミーをセット
- **入力値・操作**: obsidianOpenButtonをクリック
- **期待結果**: openLinkTextが正しい引数で呼ばれる
- **手順**:
  1. create呼び出し
  2. currentFileにダミーTFileをセット
  3. obsidianOpenButtonをクリック
  4. openLinkTextの呼び出しを検証
- **実施結果記録**:

---

### 6. 高さモード・pxの反映
- **テスト対象**: `FileViewWidget.updateExternalSettings`, `applyContentHeightStyles`
- **目的**: updateExternalSettingsでheightModeやfixedHeightPxが正しく反映されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: updateExternalSettingsで値を変更
- **期待結果**: fileContentElのstyle.heightが正しく変化
- **手順**:
  1. create呼び出し
  2. updateExternalSettingsでheightMode, fixedHeightPxを変更
  3. fileContentElのstyleを検証
- **実施結果記録**:

---

### 7. ファイル名変更時のタイトル自動更新
- **テスト対象**: `FileViewWidget.updateTitle`
- **目的**: ファイル名変更時にタイトルが自動で反映されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: config.settings.fileNameを変更し、updateTitle呼び出し
- **期待結果**: titleElのtextContentが新しいファイル名になる
- **手順**:
  1. create呼び出し
  2. config.settings.fileNameを変更
  3. updateTitle呼び出し
  4. titleElの内容を検証
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