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

