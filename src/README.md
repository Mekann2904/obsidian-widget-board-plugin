# Source Overview

This folder contains the TypeScript source for the Obsidian Widget Board plugin.

## Architecture

The plugin's architecture is centered around the `main.ts` entry point, which initializes the plugin. The `BoardManager` class manages the lifecycle and state of widget boards. Widgets are registered in `widgetRegistry.ts` and are dynamically loaded onto the board.

## Key Files

- **`main.ts`**: The main entry point for the plugin. It handles plugin loading, settings management, and command registration.
- **`boardManager.ts`**: Manages the creation, persistence, and lifecycle of widget boards.
- **`widgetRegistry.ts`**: A central registry for all available widget types. New widgets must be registered here to be available in the plugin.
- **`settingsTab.ts`**: Defines the settings UI for the plugin.

## Directory Structure

- **`i18n/`**: Handles internationalization (i18n) by providing translation strings for different languages.
- **`llm/`**: Contains modules for Large Language Model (LLM) integration, such as the Gemini API client.
- **`settings/`**: Defines the data structures and default values for the plugin's settings.
- **`utils/`**: A collection of shared utility functions, such as date formatting, DOM manipulation, and logging.
- **`widgets/`**: Contains the implementation for each individual widget. Each widget is typically in its own sub-directory.

## Development Guide

For more detailed instructions, see the [Widget Development Guide](../docs/WIDGET_DEV_GUIDE.md).

### Adding a New Widget

The process of adding a new widget involves creating the widget class, implementing the required interface, and registering it with the plugin.

1.  **Create a Directory**:
    Create a new directory for your widget under `src/widgets/` (e.g., `my-awesome-widget`).

2.  **Implement the Widget Class**:
    Inside the new directory, create an `index.ts` file. In this file, define a class that implements the `WidgetImplementation` interface (from `src/interfaces.ts`).

    -   **`id: string`**: A unique string identifier for your widget.
    -   **`create(config, app, plugin)`**: This is the core method. It must return an `HTMLElement` that represents your widget. Use this method to set up the widget's initial state, render its DOM, and add any necessary event listeners.
    -   **`onunload()` (optional)**: If your widget needs to clean up resources (e.g., remove event listeners, stop intervals), implement this method. It's called when the widget is destroyed.

    Here is a basic template:

    ```typescript
    import type { WidgetImplementation, WidgetConfig } from '../../interfaces';
    import { App } from 'obsidian';
    import type WidgetBoardPlugin from '../../main';

    export class MyAwesomeWidget implements WidgetImplementation {
        id = 'my-awesome-widget';
        config!: WidgetConfig;

        create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
            this.config = config;
            const widgetEl = document.createElement('div');
            widgetEl.classList.add('my-awesome-widget');
            widgetEl.textContent = 'Hello, World!';
            return widgetEl;
        }

        onunload() {
            // Clean up resources here
        }
    }
    ```

3.  **Register the Widget**:
    Open `src/widgetRegistry.ts` and add your new widget to the `registeredWidgetImplementations` map.

    -   First, import your widget class:
        ```typescript
        import { MyAwesomeWidget } from './widgets/my-awesome-widget';
        ```
    -   Then, register it using the same ID you defined in your class:
        ```typescript
        registeredWidgetImplementations.set('my-awesome-widget', MyAwesomeWidget);
        ```
4.  **Define Settings (Optional)**:
    If your widget requires user-configurable settings:
    -   Define a default settings object in `src/settings/defaultWidgetSettings.ts`.
    -   In your widget's `create` method, merge the default settings with any user-provided settings from `config.settings`.

### Adding Translations

1.  Add new string keys and their English translations to the appropriate file in `src/i18n/strings/`.
2.  The plugin will automatically handle making these strings available for translation.

---

# ソース概要

このフォルダーには、Obsidian Widget Board プラグインの TypeScript ソースが含まれています。

## アーキテクチャ

プラグインのアーキテクチャは、プラグインを初期化する `main.ts` エントリポイントを中心に構成されています。`BoardManager` クラスは、ウィジェットボードのライフサイクルと状態を管理します。ウィジェットは `widgetRegistry.ts` に登録され、ボードに動的にロードされます。

## 主要なファイル

- **`main.ts`**: プラグインのメインエントリポイント。プラグインの読み込み、設定管理、およびコマンド登録を処理します。
- **`boardManager.ts`**: ウィジェットボードの作成、永続化、およびライフサイクルを管理します。
- **`widgetRegistry.ts`**: 利用可能なすべてのウィジェットタイプの中央レジストリ。新しいウィジェットをプラグインで利用できるようにするには、ここで登録する必要があります。
- **`settingsTab.ts`**: プラグインの設定 UI を定義します。

## ディレクトリ構造

- **`i18n/`**: さまざまな言語の翻訳文字列を提供することにより、国際化 (i18n) を処理します。
- **`llm/`**: Gemini API クライアントなど、大規模言語モデル (LLM) 統合のためのモジュールが含まれています。
- **`settings/`**: プラグインの設定のデータ構造とデフォルト値を定義します。
- **`utils/`**: 日付の書式設定、DOM 操作、ロギングなど、共有ユーティリティ関数のコレクション。
- **`widgets/`**: 個々のウィジェットの実装が含まれています。各ウィジェットは通常、独自のサブディレクトリにあります。

## 開発ガイド

より詳細な手順については、[ウィジェット開発ガイド](../docs/WIDGET_DEV_GUIDE.md) を参照してください。

### 新しいウィジェットの追加

新しいウィジェットを追加するプロセスには、ウィジェットクラスの作成、必要なインターフェースの実装、およびプラグインへの登録が含まれます。

1.  **ディレクトリの作成**:
    `src/widgets/` の下にウィジェット用の新しいディレクトリを作成します (例: `my-awesome-widget`)。

2.  **ウィジェットクラスの実装**:
    新しいディレクトリ内に `index.ts` ファイルを作成します。このファイルで、`WidgetImplementation` インターフェース (`src/interfaces.ts` から) を実装するクラスを定義します。

    -   **`id: string`**: ウィジェットの一意の文字列識別子。
    -   **`create(config, app, plugin)`**: これが中心的なメソッドです。ウィジェットを表す `HTMLElement` を返す必要があります。このメソッドを使用して、ウィジェットの初期状態を設定し、DOM をレンダリングし、必要なイベントリスナーを追加します。
    -   **`onunload()` (任意)**: ウィジェットがリソース (例: イベントリスナーの削除、インターバルの停止) をクリーンアップする必要がある場合は、このメソッドを実装します。ウィジェットが破棄されるときに呼び出されます。

    以下は基本的なテンプレートです:

    ```typescript
    import type { WidgetImplementation, WidgetConfig } from '../../interfaces';
    import { App } from 'obsidian';
    import type WidgetBoardPlugin from '../../main';

    export class MyAwesomeWidget implements WidgetImplementation {
        id = 'my-awesome-widget';
        config!: WidgetConfig;

        create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
            this.config = config;
            const widgetEl = document.createElement('div');
            widgetEl.classList.add('my-awesome-widget');
            widgetEl.textContent = 'こんにちは、世界！';
            return widgetEl;
        }

        onunload() {
            // ここでリソースをクリーンアップします
        }
    }
    ```

3.  **ウィジェットの登録**:
    `src/widgetRegistry.ts` を開き、新しいウィジェットを `registeredWidgetImplementations` マップに追加します。

    -   まず、ウィジェットクラスをインポートします:
        ```typescript
        import { MyAwesomeWidget } from './widgets/my-awesome-widget';
        ```
    -   次に、クラスで定義したのと同じ ID を使用して登録します:
        ```typescript
        registeredWidgetImplementations.set('my-awesome-widget', MyAwesomeWidget);
        ```
4.  **設定の定義 (任意)**:
    ウィジェットにユーザーが設定可能な項目が必要な場合:
    -   `src/settings/defaultWidgetSettings.ts` にデフォルト設定オブジェクトを定義します。
    -   ウィジェットの `create` メソッドで、デフォルト設定と `config.settings` からのユーザー提供設定をマージします。

### 翻訳の追加
1.  `src/i18n/strings/` の適切なファイルに、新しい文字列キーとその英語の翻訳を追加します。
2.  プラグインは、これらの文字列を翻訳で利用できるように自動的に処理します。

