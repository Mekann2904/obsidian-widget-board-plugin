# MemoWidget テスト仕様書

## 概要
- 対象: `src/widgets/memo/index.ts` `MemoWidget`
- 目的: メモウィジェットのUI・編集・Markdown表示・設定反映の仕様検証

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                 | 結果 | 備考 |
|-----|--------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・UI要素生成                        | UI要素の生成・初期化                 |      |      |
| 2   | memoContent空時の表示                      | 空時の非表示                         |      |      |
| 3   | memoContentあり時のMarkdownレンダリング     | Markdown表示の正しさ                 |      |      |
| 4   | 編集ボタンで編集モード切替                  | 編集UIの切替・内容反映               |      |      |
| 5   | 編集→保存で内容が更新される                 | 編集内容の保存・表示切替              |      |      |
| 6   | 編集→キャンセルで内容が元に戻る             | 編集キャンセル時の復元                |      |      |
| 7   | 高さモードfixedで高さが固定される           | 高さ設定の反映                        |      |      |
| 8   | updateExternalSettingsで内容が反映される     | 外部設定変更の反映                    |      |      |
| 9   | onunloadでインスタンスが削除される          | クリーンアップ                        |      |      |
| 10  | removePersistentInstanceで削除              | インスタンス管理                      |      |      |
| 11  | cleanupAllPersistentInstancesで全削除        | インスタンス一括管理                  |      |      |

---

## 各テストケース詳細

### 1. DOM構造・UI要素生成
- **テスト対象**: `MemoWidget.create`
- **目的**: memo-widgetクラスや各UI要素が正しく生成されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: 各UI要素がDOM上に存在する
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOMを検証
- **実施結果記録**:

---

### 2. memoContent空時の表示
- **テスト対象**: `MemoWidget.create`, `renderMemo`
- **目的**: memoContentが空のとき表示エリアが非表示になるか
- **前提条件**: memoContentを空文字に設定
- **入力値・操作**: create後、memoDisplayElのstyle.displayを確認
- **期待結果**: style.displayが'none'になる
- **手順**:
  1. memoContentを空文字に設定
  2. create呼び出し
  3. memoDisplayElのstyle.displayを検証
- **実施結果記録**:

---

### 3. memoContentあり時のMarkdownレンダリング
- **テスト対象**: `MemoWidget.create`, `renderMemo`
- **目的**: memoContentがある場合にMarkdownが正しく表示されるか
- **前提条件**: memoContentにMarkdown文字列を設定
- **入力値・操作**: create後、memoDisplayElのinnerHTMLを確認
- **期待結果**: MarkdownがHTMLとして正しく描画される
- **手順**:
  1. memoContentにMarkdownを設定
  2. create呼び出し
  3. memoDisplayElのinnerHTMLを検証
- **実施結果記録**:

---

### 4. 編集ボタンで編集モード切替
- **テスト対象**: `MemoWidget.create`, 編集ボタン
- **目的**: 編集ボタン押下で編集モードに切り替わり、textareaに内容が反映されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: 編集ボタンをクリック
- **期待結果**: isEditingMemoがtrue、memoEditAreaEl.valueがmemoContentと一致
- **手順**:
  1. create呼び出し
  2. 編集ボタンをクリック
  3. 編集モード・内容を検証
- **実施結果記録**:

---

### 5. 編集→保存で内容が更新される
- **テスト対象**: 編集ボタン、保存ボタン
- **目的**: 編集→保存で内容が更新され、表示モードに戻るか
- **前提条件**: ケース1と同じ
- **入力値・操作**: 編集ボタン→textarea編集→保存ボタン
- **期待結果**: currentSettings.memoContentが新しい値、isEditingMemoがfalse
- **手順**:
  1. create呼び出し
  2. 編集ボタン→textarea編集→保存ボタン
  3. currentSettings.memoContentとisEditingMemoを検証
- **実施結果記録**:

---

### 6. 編集→キャンセルで内容が元に戻る
- **テスト対象**: 編集ボタン、キャンセルボタン
- **目的**: 編集→キャンセルで内容が元に戻るか
- **前提条件**: ケース1と同じ
- **入力値・操作**: 編集ボタン→textarea編集→キャンセルボタン
- **期待結果**: isEditingMemoがfalse、memoEditAreaEl.valueが元の内容
- **手順**:
  1. create呼び出し
  2. 編集ボタン→textarea編集→キャンセルボタン
  3. isEditingMemoとmemoEditAreaEl.valueを検証
- **実施結果記録**:

---

### 7. 高さモードfixedで高さが固定される
- **テスト対象**: `MemoWidget.create`, `applyContainerHeightStyles`
- **目的**: memoHeightModeがfixedのときcontainerの高さが固定されるか
- **前提条件**: memoHeightMode='fixed', fixedHeightPx=任意値
- **入力値・操作**: create後、memoContainerElのstyle.heightを確認
- **期待結果**: style.heightが指定値になる
- **手順**:
  1. memoHeightMode='fixed', fixedHeightPx=任意値に設定
  2. create呼び出し
  3. memoContainerElのstyle.heightを検証
- **実施結果記録**:

---

### 8. updateExternalSettingsで内容が反映される
- **テスト対象**: `MemoWidget.updateExternalSettings`
- **目的**: updateExternalSettingsでmemoContent等が反映されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: updateExternalSettingsでmemoContentを変更
- **期待結果**: currentSettings.memoContentが新しい値になる
- **手順**:
  1. create呼び出し
  2. updateExternalSettingsでmemoContentを変更
  3. currentSettings.memoContentを検証
- **実施結果記録**:

---

### 9. onunloadでインスタンスが削除される
- **テスト対象**: `MemoWidget.onunload`
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

### 10. removePersistentInstanceで削除
- **テスト対象**: `MemoWidget.removePersistentInstance`
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

### 11. cleanupAllPersistentInstancesで全削除
- **テスト対象**: `MemoWidget.cleanupAllPersistentInstances`
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