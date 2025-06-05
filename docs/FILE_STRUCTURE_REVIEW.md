# ファイル構造レビュー

`obsidian-widget-board-plugin` リポジトリの現状の構成を概観し、改善に向けた推奨事項をまとめます。

## 現在の構成

```
obsidian-widget-board-plugin/
├── .github/workflows/        # GitHub Actions の設定
├── src/                      # TypeScript ソースコード
│   ├── llm/                  # LLM 関連モジュール
│   ├── settings/             # プラグイン設定
│   ├── utils/                # ユーティリティ関数
│   └── widgets/              # 各ウィジェットの実装
├── logs/                     # ポモドーロのログ
├── *.md                      # ガイドやドキュメント
├── styles.css                # プラグインのスタイル
├── manifest.json             # Obsidian プラグインのマニフェスト
├── package.json              # Node パッケージ設定
├── tsconfig.json             # TypeScript コンパイラオプション
└── esbuild.config.mjs        # ビルド設定
```

## 詳細フォルダ構成

主要なファイルを含めた、もう少し深い階層を示します。

```
obsidian-widget-board-plugin/
├── .github/
│   └── workflows/
│       └── release.yml
├── logs/
│   └── README.md
├── src/
│   ├── interfaces.ts
│   ├── llm/
│   │   ├── gemini/
│   │   │   ├── geminiApi.ts
│   │   │   ├── prompts.d.ts
│   │   │   ├── summaryPrompts.ts
│   │   │   └── tweetReplyPrompt.ts
│   │   ├── index.ts
│   │   ├── llmManager.d.ts
│   │   ├── llmManager.ts
│   │   └── types.ts
│   ├── settings/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── utils/
│   │   ├── index.ts
│   │   ├── js-yaml.d.ts
│   │   ├── renderMarkdownBatch.ts
│   │   ├── safeFetch.ts
│   │   └── schemaForm.ts
│   ├── widgets/
│   │   ├── file-view/index.ts
│   │   ├── calendar/index.ts
│   │   ├── memo/index.ts
│   │   ├── pomodoroMemoWidget.ts
│   │   ├── pomodoro/index.ts
│   │   ├── recent-notes/index.ts
│   │   ├── reflectionWidget/
│   │   │   ├── constants.ts
│   │   │   ├── index.ts
│   │   │   ├── reflectionWidget.ts
│   │   │   ├── reflectionWidgetTypes.ts
│   │   │   └── reflectionWidgetUI.ts
│   │   ├── theme-switcher/index.ts
│   │   ├── timer-stopwatch/index.ts
│   │   ├── tweetWidget/
│   │   │   ├── TweetRepository.ts
│   │   │   ├── TweetStore.ts
│   │   │   ├── aiReply.ts
│   │   │   ├── constants.ts
│   │   │   ├── tweetWidget.md
│   │   │   ├── tweetWidget.ts
│   │   │   ├── tweetWidgetAiDb.ts
│   │   │   ├── tweetWidgetDataViewer.ts
│   │   │   ├── tweetWidgetUI.ts
│   │   │   ├── tweetWidgetUtils.ts
│   │   │   └── types.ts
│   │   └── types.ts
│   ├── main.ts
│   ├── modal.ts
│   ├── settingsDefaults.ts
│   ├── settingsTab.ts
│   └── widgetRegistry.ts
├── examples/sample.md
├── styles.css
├── manifest.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── version-bump.mjs
├── versions.json
└── esbuild.config.mjs
```

`src/widgets` ディレクトリには `pomodoro/index.ts` や `memo/index.ts`、`tweetWidget/` など各ウィジェットのファイル・サブディレクトリが含まれています。`WIDGET_DEV_GUIDE.md` や `WIDGET_PERFORMANCE_GUIDE.md` などのドキュメントは `docs/` フォルダーにまとめられています。

## 推奨事項

1. **ドキュメントの集約** – ガイド類は `docs/` フォルダーにまとめ、ルートを整理する。
   - `docs/WIDGET_DEV_GUIDE.md`
   - `docs/WIDGET_PERFORMANCE_GUIDE.md`
2. **例の配置** – `examples/sample.md` のようなサンプルは `examples/` フォルダーを作ってそこへ移動する。
3. **ウィジェットフォルダーの統一** – 各ウィジェットを専用フォルダーにまとめ、`widgets/pomodoro/index.ts` や `widgets/memo/index.ts` のように配置する。
4. **src/ に README を追加** – `src/` 内に簡潔な README を置き、サブフォルダーの目的や新ウィジェットの追加方法を説明する。
5. **index ファイルの活用** – 各ウィジェットフォルダーで `index.ts` からクラスをエクスポートし、インポートを簡潔に保つ。

これらの変更により保守性が向上し、新しい貢献者もプロジェクトを理解しやすくなります。

---

# File Structure Review

This document provides an overview of the current repository structure of `obsidian-widget-board-plugin` and some recommendations for improvement.

## Current Structure

```
obsidian-widget-board-plugin/
├── .github/workflows/        # GitHub Actions workflow
├── src/                      # TypeScript source code
│   ├── llm/                  # Large Language Model (LLM) related modules
│   ├── settings/             # Plugin settings definitions
│   ├── utils/                # Utility functions
│   └── widgets/              # Individual widget implementations
├── logs/                     # Pomodoro log documentation
├── *.md                      # Guides and documentation
├── styles.css                # Plugin styles
├── manifest.json             # Obsidian plugin manifest
├── package.json              # Node package configuration
├── tsconfig.json             # TypeScript compiler options
└── esbuild.config.mjs        # Build configuration
```

## Detailed Folder Layout

Below is a more complete tree showing notable files.

```
obsidian-widget-board-plugin/
├── .github/
│   └── workflows/
│       └── release.yml
├── logs/
│   └── README.md
├── src/
│   ├── interfaces.ts
│   ├── llm/
│   │   ├── gemini/
│   │   │   ├── geminiApi.ts
│   │   │   ├── prompts.d.ts
│   │   │   ├── summaryPrompts.ts
│   │   │   └── tweetReplyPrompt.ts
│   │   ├── index.ts
│   │   ├── llmManager.d.ts
│   │   ├── llmManager.ts
│   │   └── types.ts
│   ├── settings/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── utils/
│   │   ├── index.ts
│   │   ├── js-yaml.d.ts
│   │   ├── renderMarkdownBatch.ts
│   │   ├── safeFetch.ts
│   │   └── schemaForm.ts
│   ├── widgets/
│   │   ├── file-view/index.ts
│   │   ├── calendar/index.ts
│   │   ├── memo/index.ts
│   │   ├── pomodoroMemoWidget.ts
│   │   ├── pomodoro/index.ts
│   │   ├── recent-notes/index.ts
│   │   ├── reflectionWidget/
│   │   │   ├── constants.ts
│   │   │   ├── index.ts
│   │   │   ├── reflectionWidget.ts
│   │   │   ├── reflectionWidgetTypes.ts
│   │   │   └── reflectionWidgetUI.ts
│   │   ├── theme-switcher/index.ts
│   │   ├── timer-stopwatch/index.ts
│   │   ├── tweetWidget/
│   │   │   ├── TweetRepository.ts
│   │   │   ├── TweetStore.ts
│   │   │   ├── aiReply.ts
│   │   │   ├── constants.ts
│   │   │   ├── tweetWidget.md
│   │   │   ├── tweetWidget.ts
│   │   │   ├── tweetWidgetAiDb.ts
│   │   │   ├── tweetWidgetDataViewer.ts
│   │   │   ├── tweetWidgetUI.ts
│   │   │   ├── tweetWidgetUtils.ts
│   │   │   └── types.ts
│   │   └── types.ts
│   ├── main.ts
│   ├── modal.ts
│   ├── settingsDefaults.ts
│   ├── settingsTab.ts
│   └── widgetRegistry.ts
├── examples/sample.md
├── styles.css
├── manifest.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── version-bump.mjs
├── versions.json
└── esbuild.config.mjs
```

The `src/widgets` directory contains files and subdirectories for each widget (e.g., `pomodoro/index.ts`, `memo/index.ts`, `tweetWidget/`). Documentation files such as `WIDGET_DEV_GUIDE.md` and `WIDGET_PERFORMANCE_GUIDE.md` reside in the `docs/` directory.

## Recommendations

1. **Group documentation** – Collect all guides under a dedicated `docs/` folder to keep the root tidy. For example:
   - `docs/WIDGET_DEV_GUIDE.md`
   - `docs/WIDGET_PERFORMANCE_GUIDE.md`
2. **Move examples** – Place example markdown like `examples/sample.md` in a new `examples/` directory.
3. **Consistent widget folders** – Consider placing each widget inside its own folder for better isolation, e.g. `widgets/pomodoro/index.ts`, `widgets/memo/index.ts`.
4. **Add README to src/** – A short README inside `src/` could explain the purpose of each subfolder and how to add new widgets.
5. **Use index files** – Export widget classes via `index.ts` files inside each widget folder. This keeps imports shorter and easier to maintain.

These changes can improve maintainability and make it easier for new contributors to navigate the project.
