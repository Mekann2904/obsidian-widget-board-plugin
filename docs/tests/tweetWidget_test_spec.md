# TweetWidget テスト仕様書

## 概要
- 対象: `src/widgets/tweetWidget/tweetWidget.ts` `TweetWidget`
- 目的: ツイートウィジェットのUI・投稿・返信・リツイート・いいね・ブックマーク・AIリプライ・設定反映・異常系の仕様検証

---

## テストケース一覧

| No. | テスト内容                                         | 目的                                 | 結果 | 備考 |
|-----|----------------------------------------------------|--------------------------------------|------|------|
| 1   | DOM構造・クラス・タイトルの付与                    | UI要素・タイトルの正しい表示         |      |      |
| 2   | タブ切替でcurrentTabとUIが切り替わる                | タブ切替の動作・UI反映               |      |      |
| 3   | setFilterでcurrentFilterとUIが切り替わる            | フィルタ切替の動作・UI反映           |      |      |
| 4   | 投稿編集でeditingPostIdやUIが切り替わる             | 編集モードの動作                     |      |      |
| 5   | 投稿詳細表示でdetailPostIdが切り替わる              | 詳細表示の動作                       |      |      |
| 6   | ファイル添付でattachedFilesが更新される             | ファイル添付の反映                   |      |      |
| 7   | 空投稿ではsubmitPostで投稿が追加されない            | 入力値バリデーション                 |      |      |
| 8   | toggleRetweetでretweetedが切り替わる                | リツイート動作                       |      |      |
| 9   | toggleBookmarkでbookmarkが切り替わる                | ブックマーク動作                     |      |      |
| 10  | deletePostで投稿が削除される                       | 削除動作                             |      |      |
| 11  | updatePostPropertyで任意のプロパティが更新される    | 投稿プロパティの更新                 |      |      |
| 12  | getFilteredPostsでフィルタが反映される              | フィルタ機能の動作                   |      |      |
| 13  | AIリプライが許可される場合triggerAiReplyで副作用    | AIリプライの副作用                   |      |      |
| 14  | state未定義時にUIメソッドでエラーになる         | 異常系の安全性                       |      |      |
| 15  | submitPostで投稿が追加される                       | 投稿追加の動作                   |      |      |
| 16  | submitReplyで返信が追加される                    | 返信追加の動作                   |      |      |
| 17  | toggleLikeでlikedが切り替わる                    | いいね動作                       |      |      |
| 18  | ファイル書き込み失敗時のエラーハンドリング       | 永続化処理でエラーが発生した際の安定性検証     |      |      |
| 19  | `Esc`キーによる編集/詳細表示のキャンセル         | キーボード操作によるUIの直感的な操作性を保証     |      |      |
| 20  | Markdown特殊文字を含む投稿のレンダリング         | 多様なテキスト入力に対するUIの堅牢性確認         |      |      |
| 21  | 投稿・編集・削除のデータ永続化テスト             | `TweetRepository`との連携検証                  |      | 統合テスト |
| 22  | AIリプライ機能のE2Eフローテスト                  | `LlmManager`を含むAI関連モジュール連携の検証     |      | 統合テスト |

---

## 各テストケース詳細

### 1. DOM構造・クラス・タイトルの付与
- **テスト対象**: `TweetWidget.create`
- **目的**: tweet-widgetクラスやタイトルが正しく付与されるか
- **前提条件**: ダミーconfig/app/pluginを用意
- **入力値・操作**: `widget.create(config, app, plugin)`
- **期待結果**: .tweet-widgetクラスとタイトルが表示される
- **手順**:
  1. ダミーconfig/app/pluginを用意
  2. createを呼び出す
  3. DOM構造・タイトルを検証
- **実施結果記録**:

---

### 2. タブ切替でcurrentTabとUIが切り替わる
- **テスト対象**: `switchTab`
- **目的**: タブ切替時のstate/UI反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: switchTab('notification')
- **期待結果**: currentTabが切り替わりUIが再描画
- **手順**:
  1. create呼び出し
  2. switchTab呼び出し
  3. currentTab/UIを検証
- **実施結果記録**:

---

### 3. setFilterでcurrentFilterとUIが切り替わる
- **テスト対象**: `setFilter`
- **目的**: フィルタ切替時のstate/UI反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: setFilter('bookmark')
- **期待結果**: currentFilterが切り替わりUIが再描画
- **手順**:
  1. create呼び出し
  2. setFilter呼び出し
  3. currentFilter/UIを検証
- **実施結果記録**:

---

### 4. 投稿編集でeditingPostIdやUIが切り替わる
- **テスト対象**: `startEdit`
- **目的**: 編集モードの動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: startEdit(post)
- **期待結果**: editingPostIdが切り替わりUIが再描画
- **手順**:
  1. 投稿を追加
  2. startEdit呼び出し
  3. editingPostId/UIを検証
- **実施結果記録**:

---

### 5. 投稿詳細表示でdetailPostIdが切り替わる
- **テスト対象**: `navigateToDetail`
- **目的**: 詳細表示の動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: navigateToDetail(post.id)
- **期待結果**: detailPostIdが切り替わる
- **手順**:
  1. 投稿を追加
  2. navigateToDetail呼び出し
  3. detailPostIdを検証
- **実施結果記録**:

---

### 6. ファイル添付でattachedFilesが更新される
- **テスト対象**: `attachFiles`
- **目的**: ファイル添付の反映
- **前提条件**: ケース1と同じ
- **入力値・操作**: attachFiles([file])
- **期待結果**: attachedFilesが更新される
- **手順**:
  1. create呼び出し
  2. attachFiles呼び出し
  3. attachedFilesを検証
- **実施結果記録**:

---

### 7. 空投稿ではsubmitPostで投稿が追加されない
- **テスト対象**: `submitPost`
- **目的**: 入力値バリデーション
- **前提条件**: ケース1と同じ
- **入力値・操作**: submitPost('   ')
- **期待結果**: 投稿数が変化しない
- **手順**:
  1. create呼び出し
  2. submitPost('   ')呼び出し
  3. 投稿数を検証
- **実施結果記録**:

---

### 8. toggleRetweetでretweetedが切り替わる
- **テスト対象**: `toggleRetweet`
- **目的**: リツイート動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: toggleRetweet(post.id)
- **期待結果**: retweetedが切り替わる
- **手順**:
  1. 投稿を追加
  2. toggleRetweet呼び出し
  3. retweetedを検証
- **実施結果記録**:

---

### 9. toggleBookmarkでbookmarkが切り替わる
- **テスト対象**: `toggleBookmark`
- **目的**: ブックマーク動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: toggleBookmark(post.id)
- **期待結果**: bookmarkが切り替わる
- **手順**:
  1. 投稿を追加
  2. toggleBookmark呼び出し
  3. bookmarkを検証
- **実施結果記録**:

---

### 10. deletePostで投稿が削除される
- **テスト対象**: `deletePost`
- **目的**: 削除動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: deletePost(post.id)
- **期待結果**: 投稿が削除される
- **手順**:
  1. 投稿を追加
  2. deletePost呼び出し
  3. 投稿リストを検証
- **実施結果記録**:

---

### 11. updatePostPropertyで任意のプロパティが更新される
- **テスト対象**: `updatePostProperty`
- **目的**: 投稿プロパティの更新
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: updatePostProperty(post.id, key, value)
- **期待結果**: プロパティが更新される
- **手順**:
  1. 投稿を追加
  2. updatePostProperty呼び出し
  3. プロパティを検証
- **実施結果記録**:

---

### 12. getFilteredPostsでフィルタが反映される
- **テスト対象**: `getFilteredPosts`
- **目的**: フィルタ機能の動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: setFilter('all')/getFilteredPosts呼び出し
- **期待結果**: フィルタ結果が正しい
- **手順**:
  1. 投稿を追加
  2. setFilter('all')呼び出し
  3. getFilteredPosts呼び出し
  4. 結果を検証
- **実施結果記録**:

---

### 13. AIリプライが許可される場合triggerAiReplyで副作用
- **テスト対象**: `triggerAiReply`
- **目的**: AIリプライの副作用
- **前提条件**: 投稿が1件以上存在、shouldAutoReplyをモック
- **入力値・操作**: triggerAiReply(post)
- **期待結果**: generateAiReplyが呼ばれる
- **手順**:
  1. 投稿を追加
  2. shouldAutoReplyをモック
  3. triggerAiReply呼び出し
  4. generateAiReply呼び出しを検証
- **実施結果記録**:

---

### 14. state未定義時にUIメソッドでエラーになる
- **テスト対象**: `getFilteredPosts`等
- **目的**: state未定義時の安全性
- **前提条件**: ケース1と同じ
- **入力値・操作**: storeをundefinedにしてgetFilteredPosts呼び出し
- **期待結果**: エラーがthrowされる
- **手順**:
  1. create呼び出し
  2. storeをundefinedに
  3. getFilteredPosts呼び出し
  4. エラーがthrowされることを検証
- **実施結果記録**:

---
### 15. submitPostで投稿が追加される
- **テスト対象**: `submitPost`
- **目的**: 投稿が追加されるか
- **前提条件**: ケース1と同じ
- **入力値・操作**: submitPost('テスト投稿')
- **期待結果**: currentSettings.postsに新規投稿が追加される
- **手順**:
  1. create呼び出し
  2. submitPost('テスト投稿')呼び出し
  3. posts配列を検証
- **実施結果記録**:

---

### 16. submitReplyで返信が追加される
- **テスト対象**: `submitReply`
- **目的**: 返信が追加されるか
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: submitReply('返信テスト', parentId)
- **期待結果**: posts配列に返信が追加される
- **手順**:
  1. 投稿を追加
  2. submitReply('返信テスト', parentId)呼び出し
  3. posts配列を検証
- **実施結果記録**:

---

### 17. toggleLikeでlikedが切り替わる
- **テスト対象**: `toggleLike`
- **目的**: いいね動作
- **前提条件**: 投稿が1件以上存在
- **入力値・操作**: toggleLike(postId)
- **期待結果**: likedがtrueになる
- **手順**:
  1. 投稿を追加
  2. toggleLike呼び出し
  3. likedを検証
- **実施結果記録**:

---

### 18. ファイル書き込み失敗時のエラーハンドリング
- **テスト対象**: `submitPost`, `submitReply`等 (永続化を伴う操作)
- **目的**: `app.vault.adapter.write`が失敗した際に、アプリがクラッシュせず、適切にエラー処理が行われるか。
- **前提条件**: `app.vault.adapter.write`をリジェクトするようモックする。
- **入力値・操作**: `submitPost('test')`
- **期待結果**: エラーがthrowされない、または適切にキャッチされる。UIにエラーメッセージが表示されるなど。
- **手順**:
  1. `jest.spyOn(dummyApp.vault.adapter, 'write').mockRejectedValue(new Error('Disk full'))` でモックする。
  2. `submitPost` を呼び出す。
  3. アプリケーションがクラッシュしないことを確認する。
- **実施結果記録**:

---

### 19. `Esc`キーによる編集/詳細表示のキャンセル
- **テスト対象**: `handleKeyDown` (またはキーイベントを処理する部分)
- **目的**: 編集モードまたは詳細表示モードで `Esc` キーを押すと、通常表示に戻るか。
- **前提条件**: 投稿が1件以上存在し、編集モードまたは詳細表示モードになっている。
- **入力値・操作**: `Esc`キーの `KeyboardEvent` をディスパッチする。
- **期待結果**: `editingPostId` または `detailPostId` が `null` になる。UIが一覧表示に戻る。
- **手順**:
  1. 投稿を追加し、`startEdit` または `navigateToDetail` を呼び出す。
  2. `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))` を実行する。
  3. `editingPostId` や `detailPostId` の状態とUIを検証する。
- **実施結果記録**:

---

### 20. Markdown特殊文字を含む投稿のレンダリング
- **テスト対象**: UIレンダリング部分
- **目的**: `#` や `*`, `[]()` などのMarkdown特殊文字を含むテキストを投稿しても、表示が崩れないか。
- **前提条件**: ケース1と同じ
- **入力値・操作**: `submitPost('# 見出し\n* リスト\n[リンク](https'//example.com)')`
- **期待結果**: 特殊文字がエスケープされるか、意図通りにレンダリングされ、レイアウトが崩れない。
- **手順**:
  1. Markdown特殊文字を含むテキストで投稿する。
  2. レンダリングされたHTMLの内容を確認し、表示崩れがないか検証する。
- **実施結果記録**:

---

### 21. 投稿・編集・削除のデータ永続化テスト
- **テスト対象**: `submitPost`, `startEdit`/`submitEdit`, `deletePost`
- **目的**: `TweetRepository` の `save` メソッドが適切なデータで呼び出されるか。
- **前提条件**: `TweetRepository` の `save` メソッドをスパイする。
- **入力値・操作**: 投稿、編集、削除操作を行う。
- **期待結果**: 操作に応じて `save` メソッドが正しい引数で呼び出される。
- **手順**:
  1. `TweetRepository.prototype.save` を `jest.spyOn` する。
  2. `submitPost`, `deletePost` などの操作を行う。
  3. スパイが期待通りに呼び出されたか検証する。
- **実施結果記録**:

---

### 22. AIリプライ機能のE2Eフローテスト
- **テスト対象**: `triggerAiReply`
- **目的**: `LlmManager` との連携を含めたAIリプライ機能全体が動作するか。
- **前提条件**: `LlmManager` のメソッドをモックする。
- **入力値・操作**: `triggerAiReply(post)`
- **期待結果**: `LlmManager` の関連メソッドが呼び出され、返信が生成・投稿される。
- **手順**:
  1. `LlmManager` のメソッドをモックする。
  2. `shouldAutoReply` が `true` を返すように設定する。
  3. `triggerAiReply` を呼び出す。
  4. モックした `LlmManager` のメソッド呼び出しを検証する。
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
- [ ] ケース18
- [ ] ケース19
- [ ] ケース20
- [ ] ケース21
- [ ] ケース22
