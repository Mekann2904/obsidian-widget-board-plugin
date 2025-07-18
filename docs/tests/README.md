# Test Management Guide

このドキュメントでは、`obsidian-widget-board-plugin` のテスト構成と実行方法について説明します。Jest を用いたユニットテストを中心に、再利用・更新しやすい形で管理するための基本方針をまとめています。

## フォルダ構成

```
obsidian-widget-board-plugin/
├── __tests__/
│   ├── widgets/  # 各ウィジェットのテスト
│   └── utils/    # 共有ユーティリティのテスト
├── __mocks__/          # Obsidian API などのモック
├── jest.config.js      # Jest 設定ファイル
└── jest.setup.js       # テスト実行前のセットアップ
```

- `__tests__/widgets` 配下にウィジェットごとのテスト、`__tests__/utils` 配下に共通ユーティリティのテストを置きます。
- いずれも `*.test.ts` を配置するだけで自動的に Jest に認識されます。

## テストの実行

依存パッケージをインストール後、以下のコマンドでテストを実行できます。

```bash
npm test
```

## 新しいテストの追加方法

1. テスト内容に応じて `__tests__/widgets` または `__tests__/utils` 内に `xxx.test.ts` を作成します。
2. 必要に応じて `__mocks__/` 内のモックを追加・更新します。

3. `npm test` を実行してテストが成功することを確認します。
テストケースの全体像は [test-plan.md](test-plan.md) を参照してください。

## 参考

- Jest 公式ドキュメント: <https://jestjs.io/ja/docs/getting-started>

## テスト充実計画・チェックリスト

本プラグインの品質向上のため、以下の観点でテストを拡充していきます。

### 1. ウィジェット単位のテスト
- [x] ポモドーロウィジェット
- [X] メモウィジェット
- [x] カレンダーウィジェット
- [x] タイマー/ストップウォッチウィジェット
- [x] 最近ノートウィジェット
- [x] テーマ切り替えウィジェット
- [x] ファイルビューアウィジェット
- [x] つぶやきウィジェット
- [x] 振り返りウィジェット

#### 各ウィジェットで確認すべき観点例
- [x] UI要素の生成・初期化
- [x] 設定値の反映・保存
- [x] 編集・削除・並べ替え等の操作
- [x] データの永続化・復元
- [x] 異常系（不正値・空値・例外）
- [x] パフォーマンス（大量データ・高速操作）
- [x] レスポンシブ・アクセシビリティ
- [x] 他ウィジェットとの連携

### 2. ユーティリティ・共通関数のテスト
 - [x] 日付・時間ユーティリティ
 - [x] Markdownレンダリング
 - [x] safeFetch等のAPIラッパー
 - [x] ロガー・エラーハンドリング
 - [x] その他utils/

### 3. AI連携・プロンプト機能
- [x] AI要約・AIリプライのプロンプト置換
- [x] モデル切替・エラー時の挙動
- [x] キャッシュ・再利用の検証

### 4. 異常系・例外処理
- [ ] 設定ファイル破損時の復旧
- [x] DBファイル不整合時の挙動
- [x] ネットワークエラー時のUI
- [x] 予期しない入力・操作

### 5. パフォーマンス・大量データ
- [ ] 仮想リスト・バッチ描画の検証
- [ ] 1000件超のデータでの動作
- [ ] メモリリーク・GC

### 6. E2E・統合テスト（将来的な拡張）
- [ ] ボード全体の操作フロー
- [ ] ウィジェット追加・削除・並べ替え
- [ ] 設定画面の一括操作

---

> このチェックリストは随時アップデートし、各カテゴリごとにテスト仕様書（`docs/tests/*_test_spec.md`）やテストコード（`__tests__`配下）を充実させていきます。

