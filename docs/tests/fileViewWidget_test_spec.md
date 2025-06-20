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
| 8   | `onunload` でのリソース解放                | メモリリーク防止                      |      | 単体 |
| 9   | Markdownレンダリングの検証                 | MarkdownのHTML描画検証                |      | 単体 |
| 10  | `openFileSuggest` の呼び出し検証           | ファイル候補表示機能の呼び出し確認    |      | 単体 |
| 11  | ファイル変更の自動更新                     | 外部でのファイル変更の自動反映        |      | 単体 |
| 12  | エッジケース：空ファイルの表示             | 空ファイル表示時の正常動作確認        |      | 単体 |
| 13  | エッジケース：ファイル名に特殊文字         | 特殊文字を含むファイル名の処理        |      | 単体 |
| 14  | ファイル選択から表示までの一貫テスト       | ファイル選択〜表示の一連動作          |      | 統合 |
| 15  | 設定の保存と復元の連携                     | 設定変更時の保存機能呼び出し          |      | 統合 |
| 16  | ウィジェットリサイズへの追従               | `auto`モードでの高さ自動調整          |      | 統合 |

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

### 8. `onunload` でのリソース解放
- **テスト対象**: `FileViewWidget.onunload`
- **目的**: ウィジェット破棄時にイベントリスナー等が正しく解除され、メモリリークを防ぐ
- **前提条件**: `registerEvent`などで監視を開始している状態
- **入力値・操作**: `onunload`を呼び出す
- **期待結果**: `this.events`に登録されたイベントが`app.workspace.offref`で解除される
- **手順**:
  1. `app.workspace.on`をモックし、`events`配列に`EventRef`が登録されるようにする
  2. `onunload`を呼び出す
  3. `offref`が呼ばれたことを確認する
- **実施結果記録**:

---

### 9. Markdownレンダリングの検証
- **テスト対象**: `FileViewWidget.loadFile`内のMarkdownレンダリング処理
- **目的**: Markdown形式のファイル内容（見出し、リスト等）が正しくHTMLとして描画されるか
- **前提条件**: `app.vault.read`がMarkdown文字列を返す
- **入力値・操作**: `loadFile`を呼び出す
- **期待結果**: `fileContentEl`内に適切なHTML要素（`h1`, `ul`等）が生成される
- **手順**:
  1. `app.vault.read`が`# Title`のようなMarkdownを返すように設定
  2. `MarkdownRenderer`が呼ばれることを確認
  3. `fileContentEl`の`innerHTML`を検証
- **実施結果記録**:

---

### 10. `openFileSuggest` の呼び出し検証
- **テスト対象**: ファイル選択ボタンのクリックイベント
- **目的**: ファイル選択ボタン押下で、ファイル候補を提示する機能が呼び出されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: ファイル選択ボタンをクリック
- **期待結果**: `openFileSuggest`が呼び出される
- **手順**:
  1. `openFileSuggest`を`jest.fn()`でモックする
  2. ファイル選択ボタン（`fileSuggestButton`）をクリック
  3. `openFileSuggest`が1回呼び出されたことを確認
- **実施結果記録**:

---

### 11. ファイル変更の自動更新
- **テスト対象**: `onFileModify`イベントハンドラ
- **目的**: 表示中のファイルが外部で変更された際、ウィジェットの内容が自動で更新されるか
- **前提条件**: ファイルが表示されている状態
- **入力値・操作**: `app.vault.on('modify', ...)`で登録したコールバックを擬似的に実行
- **期待結果**: `loadFile`が再度呼び出され、内容が更新される
- **手順**:
  1. `loadFile`をスパイする
  2. `onFileModify`のコールバックを、表示中のファイルオブジェクトを引数に実行
  3. `loadFile`が再度呼び出されたことを確認
- **実施結果記録**:

---

### 12. エッジケース：空ファイルの表示
- **テスト対象**: `loadFile`
- **目的**: 内容が空のファイルを表示してもエラーなく、コンテンツエリアが空で表示されるか
- **前提条件**: `app.vault.read`が空文字列を返す
- **入力値・操作**: `loadFile`を呼び出す
- **期待結果**: エラーが発生せず、`fileContentEl`の`innerHTML`が空になる
- **手順**:
  1. `app.vault.read`が空文字列を返すようにモック
  2. create後に`loadFile`が実行されるのを待つ
  3. `fileContentEl.textContent`が空またはそれに近い状態であることを確認
- **実施結果記録**:

---

### 13. エッジケース：ファイル名に特殊文字
- **テスト対象**: `loadFile`, `updateTitle`
- **目的**: スペースや`&`, `#`などの特殊文字を含むファイル名を正しく扱えるか
- **前提条件**: `dummyConfig.settings.fileName`に特殊文字を含むファイル名を設定
- **入力値・操作**: `create`を呼び出す
- **期待結果**: `getAbstractFileByPath`が正しいファイル名で呼ばれ、タイトルも正しく表示される
- **手順**:
  1. ファイル名に`"file with space.md"`などを設定
  2. createを呼び出す
  3. `app.vault.getAbstractFileByPath`の引数と、`titleEl`の表示を検証
- **実施結果記録**:

---

### 14. ファイル選択から表示までの一貫テスト (統合)
- **テスト対象**: `openFileSuggest`, `setFile`, `loadFile`の連携
- **目的**: ファイルサジェスト機能でファイルを選択後、その内容がウィジェットにロードされるまでの一連の流れを検証
- **前提条件**: -
- **入力値・操作**: `openFileSuggest`のコールバックを擬似的に実行
- **期待結果**: `config.settings.fileName`が更新され、`loadFile`が実行され、内容が表示される
- **手順**:
  1. `openFileSuggest`をモックし、そのコールバックを取得
  2. コールバックにダミーファイルオブジェクトを渡して実行
  3. `config.settings.fileName`、`plugin.saveSettings`の呼び出し、`fileContentEl`の内容を一貫して検証
- **実施結果記録**:

---

### 15. 設定の保存と復元の連携 (統合)
- **テスト対象**: `setFile`, `updateExternalSettings` と `plugin.saveSettings` の連携
- **目的**: ウィジェットの設定変更時にプラグイン全体の設定保存機能が呼び出されるか
- **前提条件**: `plugin.saveSettings`をモック
- **入力値・操作**: `setFile`や`updateExternalSettings`を呼び出す
- **期待結果**: `plugin.saveSettings`が呼び出される
- **手順**:
  1. `setFile`を呼び出す -> `saveSettings`が呼ばれることを確認
  2. `updateExternalSettings`を呼び出す -> `saveSettings`が呼ばれることを確認
- **実施結果記録**:

---

### 16. ウィジェットリサイズへの追従 (統合)
- **テスト対象**: `ResizeObserver`のコールバックと`applyContentHeightStyles`
- **目的**: ウィジェットのコンテナサイズ変更時、高さ自動調整モード(`auto`)でコンテンツ表示領域が追従するか
- **前提条件**: `heightMode`が`auto`。`ResizeObserver`のモックが必要
- **入力値・操作**: `ResizeObserver`のコールバックを擬似的に実行
- **期待結果**: `fileContentEl`の高さスタイルが適切に更新される
- **手順**:
  1. `ResizeObserver`をモックし、create時にインスタンスとコールバックをキャプチャ
  2. コールバックを擬似的に実行
  3. `applyContentHeightStyles`が呼ばれ、高さが更新されることを確認
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