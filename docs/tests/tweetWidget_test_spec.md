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

## 進捗・メモ

- [ ] ケース1 実施済み
- [ ] ケース2 実施済み
- [ ] ケース3 実施済み
- [ ] ケース4 実施済み
- [ ] ケース5 実施済み
- [ ] ケース6 実施済み
- [ ] ケース7 実施済み
- [ ] ケース8 実施済み
- [ ] ケース9 実施済み
- [ ] ケース10 実施済み
- [ ] ケース11 実施済み
- [ ] ケース12 実施済み
- [ ] ケース13 実施済み
- [ ] ケース14 実施済み 
- [ ] ケース15 実施済み
- [ ] ケース16 実施済み
- [ ] ケース17 実施済み
