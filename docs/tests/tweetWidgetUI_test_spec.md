# TweetWidgetUI テスト仕様書

## 概要
- 対象: `src/widgets/tweetWidget/tweetWidgetUI.ts` `TweetWidgetUI`
- 目的: ツイートウィジェットのUIクラスにおける描画スケジュール、モーダル表示、スクロール操作を検証する

---

## テストケース一覧

| No. | テスト内容                                     | 目的                       |
|-----|------------------------------------------------|----------------------------|
| 1   | scheduleRenderが重複呼び出しでも一度だけrender | 無駄な再描画を防ぐ          |
| 2   | resetScrollでスクロール位置が初期化される       | スクロールリセットの確認    |
| 3   | showAvatarModalの表示とEsc閉じ                  | アバターモーダルのUI検証    |
| 4   | updateCharCountで文字数クラス切替               | 入力文字数表示の更新        |

---

## 進捗・メモ

- [x] ケース1 実施済み
- [x] ケース2 実施済み
- [x] ケース3 実施済み
- [x] ケース4 実施済み
