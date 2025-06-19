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
| 12  | Markdown多様記法のレンダリング検証           | Markdown記法の網羅的な表示検証         |      |      |
| 13  | 長文・大量データ時のパフォーマンス             | パフォーマンス・安定性                  |      |      |
| 14  | 編集・保存時のエラー処理                       | 異常系・例外時のハンドリング            |      |      |
| 15  | 他ウィジェットとの同時利用                      | 統合動作・干渉有無                      |      |      |
| 16  | テーマ切替時のUI変化                            | テーマ連動のUI反映                      |      |      |
| 17  | 設定ファイル破損時のリカバリ                    | システム異常時の復旧                    |      |      |
| 18  | UAT: メモ作成～編集～保存の一連体験              | ユーザー操作フローの受け入れ            |      |      |
| 19  | UAT: 誤操作時のリカバリ                         | 誤キャンセル・閉じる時のデータ保護      |      |      |
| 20  | UAT: モバイル・アクセシビリティ                  | レスポンシブ・キーボード操作            |      |      |

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
- **期待結果**: style.displayが''または'none'になる
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
- **期待結果**: memoEditContainerEl.style.displayが''または'none'になる
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
- **期待結果**: isEditingMemoがfalse、memoEditAreaEl.valueが文字列
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
- **期待結果**: style.heightが指定値または''になる
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

### 12. Markdown多様記法のレンダリング検証
- **テスト対象**: MemoWidget.create, renderMemo
- **目的**: チェックボックス・リスト・リンク・画像・コード等のMarkdownが正しくHTML化されるか
- **前提条件**: memoContentに多様なMarkdown文字列を設定
- **入力値・操作**: create後、memoDisplayElのinnerHTMLを確認
- **期待結果**: 各Markdown記法が正しくHTML化される
- **手順**:
  1. memoContentに複数のMarkdown記法を設定
  2. create呼び出し
  3. memoDisplayElのinnerHTMLを検証
- **実施結果記録**:

---

### 13. 長文・大量データ時のパフォーマンス
- **テスト対象**: MemoWidget.create, renderMemo
- **目的**: 1万文字以上の長文や大量データでも遅延・クラッシュが発生しないか
- **前提条件**: memoContentに非常に長いテキストを設定
- **入力値・操作**: create後、描画速度やエラー発生有無を確認
- **期待結果**: 遅延やクラッシュが発生しない
- **手順**:
  1. memoContentに1万文字以上のテキストを設定
  2. create呼び出し
  3. パフォーマンス・エラー有無を検証
- **実施結果記録**:

---

### 14. 編集・保存時のエラー処理
- **テスト対象**: 編集ボタン、保存ボタン、plugin.saveSettings
- **目的**: 保存時に例外やエラーが発生した場合のハンドリング
- **前提条件**: plugin.saveSettingsが失敗するようにモック
- **入力値・操作**: 編集→保存時にエラーを発生させる
- **期待結果**: エラーメッセージ表示やロールバック等の適切な処理
- **手順**:
  1. plugin.saveSettingsを失敗させる
  2. 編集→保存操作
  3. エラー時の挙動を検証
- **実施結果記録**:

---

### 15. 他ウィジェットとの同時利用
- **テスト対象**: MemoWidget, 他ウィジェット
- **目的**: 他ウィジェットと同時利用時の干渉有無
- **前提条件**: ボード上に複数ウィジェットを配置
- **入力値・操作**: MemoWidgetと他ウィジェットを同時に操作
- **期待結果**: 干渉や不具合が発生しない
- **手順**:
  1. 複数ウィジェットを配置
  2. それぞれ操作
  3. 干渉有無を検証
- **実施結果記録**:

---

### 16. テーマ切替時のUI変化
- **テスト対象**: MemoWidget, テーマ切替機能
- **目的**: ダーク/ライトテーマ切替時にUIが正しく変化するか
- **前提条件**: テーマ切替機能を有効化
- **入力値・操作**: テーマを切り替える
- **期待結果**: MemoWidgetのUIがテーマに応じて変化
- **手順**:
  1. テーマ切替
  2. MemoWidgetのUIを検証
- **実施結果記録**:

---

### 17. 設定ファイル破損時のリカバリ
- **テスト対象**: MemoWidget, 設定ファイル
- **目的**: 設定ファイルが壊れている場合の復旧動作
- **前提条件**: 設定ファイルを破損状態にする
- **入力値・操作**: MemoWidgetを起動
- **期待結果**: エラー表示やデフォルト復元等の適切な処理
- **手順**:
  1. 設定ファイルを破損させる
  2. MemoWidgetを起動
  3. 復旧動作を検証
- **実施結果記録**:

---

### 18. UAT: メモ作成～編集～保存の一連体験
- **テスト対象**: MemoWidget全体
- **目的**: ユーザーが新規作成・編集・保存・再編集できるか
- **前提条件**: 通常利用環境
- **入力値・操作**: メモ作成→編集→保存→再編集
- **期待結果**: すべての操作が正常に完了
- **手順**:
  1. メモ作成
  2. 編集・保存
  3. 再編集
  4. 各操作の正常完了を検証
- **実施結果記録**:

---

### 19. UAT: 誤操作時のリカバリ
- **テスト対象**: MemoWidget全体
- **目的**: 編集中にキャンセルや閉じる操作をしてもデータ消失が起きないか
- **前提条件**: 編集中の状態
- **入力値・操作**: 編集中にキャンセル・閉じる
- **期待結果**: データが消失しない、警告等が表示される
- **手順**:
  1. 編集中にキャンセル・閉じる
  2. データ保護・警告表示を検証
- **実施結果記録**:

---

### 20. UAT: モバイル・アクセシビリティ
- **テスト対象**: MemoWidget全体
- **目的**: モバイル画面やキーボード操作、スクリーンリーダーでの利用体験
- **前提条件**: モバイル端末・アクセシビリティツール
- **入力値・操作**: モバイル画面での操作、キーボード・リーダー操作
- **期待結果**: レスポンシブ表示、キーボード・リーダー操作が正常
- **手順**:
  1. モバイル画面で操作
  2. キーボード・リーダーで操作
  3. 各体験を検証
- **実施結果記録**:

---

## 進捗・メモ

- [x] ケース1 実施済み
- [x] ケース2 実施済み
- [x] ケース3 実施済み
- [x] ケース4 実施済み
- [x] ケース5 実施済み
- [x] ケース6 実施済み
- [x] ケース7 実施済み
- [x] ケース8 実施済み
- [x] ケース9 実施済み
- [x] ケース10 実施済み
- [x] ケース11 実施済み
- [x] ケース12 実施済み
- [x] ケース13 実施済み
- [x] ケース14 実施済み
- [x] ケース15 実施済み
- [x] ケース16 実施済み
- [x] ケース17 実施済み
- [x] ケース18 実施済み
- [x] ケース19 実施済み
- [x] ケース20 実施済み 
