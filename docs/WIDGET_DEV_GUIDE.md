# Obsidian Widget Board Plugin
## ウィジェット開発マニュアル（決定版）

このドキュメントは、現行コードベースに基づき、Obsidian Widget Boardプラグインでカスタムウィジェットを開発するための包括的なガイドです。

---

## 目次

1.  **概要**
    -   1.1. 背景・目的
    -   1.2. 設計思想
    -   1.3. 全体構成
2.  **ウィジェット開発フロー**
    -   2.1. 背景・理論
    -   2.2. 推奨フロー
    -   2.3. パフォーマンス設計チェックリスト
3.  **ウィジェット登録・管理の仕組み**
    -   3.1. 背景・理論
    -   3.2. 実装例
    -   3.3. FAQ
4.  **ウィジェット実装の要件**
    -   4.1. `WidgetImplementation`インターフェース
    -   4.2. 実装テンプレート (推奨ユーティリティ使用)
    -   4.3. パフォーマンス観点での実装要件
5.  **設定と状態管理**
    -   5.1. 基本的な設定管理
    -   5.2. 高度なデータ永続化（リポジトリパターン）
6.  **主要ユーティリティの活用**
    -   6.1. コンテナ生成 (`createWidgetContainer`, `applyWidgetSize`)
    -   6.2. UIヘルパー (`createAccordion`)
    -   6.3. Markdownレンダリング
    -   6.4. デバッグとロギング
    -   6.5. 国際化 (i18n)
7.  **LLM（大規模言語モデル）連携**
    -   7.1. `LlmManager`の利用
    -   7.2. 実装例
8.  **ベストプラクティス・FAQ**
    -   8.1. ベストプラクティス
    -   8.2. FAQ
    -   8.3. セルフチェックリスト
9.  **引用元ファイル一覧**
10. **高度なアーキテクチャと今後の展望**

---

## 1. 概要

### 1.1. 背景・目的
Obsidian Widget Board Pluginは、Obsidian上で多様なウィジェットを柔軟に追加・管理できる拡張プラットフォームです。ユーザーや開発者が独自のウィジェットを簡単に追加・カスタマイズできるよう、拡張性・保守性・パフォーマンスを重視した設計となっています。

### 1.2. 設計思想
- **拡張性**: 新規ウィジェットの追加・既存ウィジェットのカスタマイズが容易です。
- **一元管理**: 全ウィジェット・設定・状態を一元的に管理します。
- **パフォーマンス**: 仮想リスト・バッチ描画・CSS Containment等の最適化を標準化しています。
- **型安全性**: TypeScriptによる厳密な型定義を行っています。

### 1.3. 全体構成
- **プラグイン本体 (`main.ts`)**: 設定・ボード・ウィジェットの管理、永続化の中枢。
- **ウィジェット登録機構 (`widgetRegistry.ts`)**: ウィジェットの型をMapで一元管理。
- **ウィジェット本体 (`src/widgets/`)**: 各ウィジェットの実装。
- **ユーティリティ (`src/utils/`)**: 便利なヘルパー関数群。
- **型定義 (`interfaces.ts`)**: `WidgetImplementation`などの主要な型。

---

## 2. ウィジェット開発フロー

### 2.1. 背景・理論
ウィジェット開発では「機能性・拡張性」と「パフォーマンス最適化」の両立が重要です。特にObsidianのようなノートアプリでは、UIの規模が大きくなりやすく、設計段階からパフォーマンス指針（`WIDGET_PERFORMANCE_GUIDE.md`）を意識することで、後からの大規模なリファクタリングを防ぎます。

### 2.2. 推奨フロー
1. **設計**: 機能、UI、設定項目を明確化し、パフォーマンスガイドを必ず参照します。
2. **ファイル作成**: `src/widgets/`にウィジェット用ディレクトリを作成します。
3. **クラス実装**: `WidgetImplementation`インターフェースを実装します。DOM生成時には`createWidgetContainer`等のユーティリティ利用を強く推奨します。（詳細は第4, 6章を参照）
4. **登録**: `widgetRegistry.ts`にウィジェットクラスを登録します。
5. **設定定義**: 必要なら`defaultWidgetSettings.ts`にデフォルト設定を追加します。
6. **スタイル定義**: `styles.css`に専用スタイルを追加します。`contain`プロパティの利用も検討します。
7. **動作確認**: Obsidian上で動作を確認し、開発者ツールのPerformanceタブで描画コストを計測します。

### 2.3. パフォーマンス設計チェックリスト
開発・レビュー時に必ず確認してください。
- [ ] ループ内での直接的なDOM操作（`appendChild`等）を避けているか？ (`DocumentFragment`を利用)
- [ ] 大規模なリスト表示は仮想化またはバッチ処理されているか？
- [ ] Markdown描画は`renderMarkdownBatchWithCache`を利用しているか？
- [ ] 親要素に`contain: layout style paint;`を適用し、レンダリング範囲を限定しているか？
- [ ] レイアウト計算とスタイル変更が混在していないか？（Read/Writeの分離）

---
## 3. ウィジェット登録・管理の仕組み

### 3.1. 背景・理論
ウィジェットの登録・管理は、拡張性・動的UI生成・設定管理の要です。`Map`による一元管理により、ウィジェット追加モーダルや設定タブが自動的に拡張され、保守性が大きく向上します。

### 3.2. 実装例
```ts
// src/widgetRegistry.ts
import { MyWidget } from './widgets/myWidget';

// 'my-widget'というIDで、MyWidgetクラスを登録します。
// このIDはYAMLでtypeとして指定する値と一致させる必要があります。
registeredWidgetImplementations.set('my-widget', MyWidget);
```

### 3.3. FAQ
- **Q. 登録しないとどうなる？**
  - A. ウィジェット追加モーダルに表示されず、ユーザーが利用できません。
- **Q. IDやクラス名の命名規則は？**
  - A. 他のウィジェットと重複しない、ケバブケースの一意なIDを推奨します。

---
## 4. ウィジェット実装の要件

### 4.1. `WidgetImplementation`インターフェース
すべてのウィジェットが実装すべき必須のインターフェースです。
- **`id: string`**: ウィジェットの一意なID。登録時のキーと一致させます。
- **`create(config, app, plugin)`**: ウィジェットの`HTMLElement`を生成して返す必須メソッド。ウィジェットの初期化処理もここで行います。
- **`onunload()?`**: ウィジェットが破棄される際のクリーンアップ処理（イベントリスナーの削除など）。
- **`updateExternalSettings?(...)`**: 設定画面など、外部から設定が変更された際に呼び出されます。
- **`refresh()?`**: 外部からウィジェットの表示更新をトリガーするためのメソッド。

### 4.2. 実装テンプレート (推奨ユーティリティ使用)
```ts
import type { WidgetImplementation, WidgetConfig } from '../interfaces';
import type WidgetBoardPlugin from '../main';
import { createWidgetContainer, applyWidgetSize } from '../../utils';

export class MyWidget implements WidgetImplementation {
  id = 'my-widget';
  widgetEl!: HTMLElement;

  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    // コンテナとタイトルを生成
    const { widgetEl, titleEl } = createWidgetContainer(config, 'my-widget-class');
    this.widgetEl = widgetEl;
    
    // YAMLからのwidth/height設定を適用
    applyWidgetSize(this.widgetEl, config.settings as any);
    
    // ウィジェットのコンテンツを生成
    const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
    contentEl.textContent = 'Hello World!';
    
    // レンダリング範囲を限定し、パフォーマンスを向上させる
    this.widgetEl.style.contain = 'layout style paint';
    
    return this.widgetEl;
  }

  onunload() {
    // イベントリスナーやタイマーなど、ここでリソースを解放します
  }
}
```

### 4.3. パフォーマンス観点での実装要件
- `create`メソッド内でのループを伴うDOM生成では、`DocumentFragment`を使用して一括で`append`し、リフローの回数を最小限に抑えます。
- `onunload`では、`addEventListener`で登録したイベントリスナーを必ず`removeEventListener`で解除します。

---
## 5. 設定と状態管理

### 5.1. 基本的な設定管理
ウィジェットごとの簡単な設定（ON/OFFスイッチ、テキスト入力など）は、`config.settings`オブジェクトを介して管理します。このオブジェクトの内容はプラグインがボードごとに自動で永続化します。`src/settings/defaultWidgetSettings.ts`でウィジェットのデフォルト設定を定義しておくことを強く推奨します。

### 5.2. 高度なデータ永続化（リポジトリパターン）
投稿リストのような、ウィジェット固有の複雑なデータを管理・永続化する場合は、リポジトリパターンを推奨します。これは、データの読み書きロジックをカプセル化し、ウィジェット本体のコードをクリーンに保つための設計パターンです。
- **責務**: Repositoryクラスは、`app.vault.adapter`を用いてJSONファイルとしてVault内にデータを読み書きする責務を持ちます。
- **実装例**: `src/widgets/tweetWidget/TweetRepository.ts`が具体的な実装例です。

```ts
// src/widgets/myWidget/MyWidgetRepository.ts のようなファイルを作成
import { App } from 'obsidian';
import type { MyWidgetData } from './types';

export class MyWidgetRepository {
  constructor(private app: App, private dbPath: string) {}

  async load(): Promise<MyWidgetData> {
    if (!await this.app.vault.adapter.exists(this.dbPath)) {
      return { posts: [] }; // デフォルトデータ
    }
    const raw = await this.app.vault.adapter.read(this.dbPath);
    return JSON.parse(raw) as MyWidgetData;
  }

  async save(data: MyWidgetData): Promise<void> {
    const jsonData = JSON.stringify(data, null, 2);
    await this.app.vault.adapter.write(this.dbPath, jsonData);
  }
}
```

---
## 6. 主要ユーティリティの活用

### 6.1. コンテナ生成 (`createWidgetContainer`, `applyWidgetSize`)
- **`createWidgetContainer`**: ウィジェットの標準的な外枠（タイトルバー含む）を生成します。一貫したUIを提供するために、この関数の使用を推奨します。
- **`applyWidgetSize`**: YAMLで指定された`width`や`height`をウィジェットの要素に適用します。

### 6.2. UIヘルパー (`createAccordion`)
`src/utils/uiHelpers.ts`の`createAccordion`関数は、設定項目などを折りたたむアコーディオンUIを簡単に作成できます。
```ts
import { createAccordion } from '../../utils/uiHelpers';
const { header, body } = createAccordion(container, "詳細設定", false);
body.createEl('p', { text: 'ここに設定項目を追加します。' });
```

### 6.3. Markdownレンダリング
`renderMarkdownBatchWithCache` (`src/utils/renderMarkdownBatch.ts`) は、Markdown文字列を効率的にHTMLに変換し、結果をキャッシュする推奨ユーティリティです。
```ts
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { Component } from 'obsidian';

const component = new Component(); // レンダラのライフサイクルを管理
// ...
await renderMarkdownBatchWithCache(markdownText, container, '', component);
// ...
// 必ず onUnload でコンポーネントを破棄する
component.unload();
```

### 6.4. デバッグとロギング
プラグイン設定で「デバッグログ出力を有効にする」をオンにした後、`debugLog` (`src/utils/logger.ts`) で開発時のみ表示されるログを出力できます。
```ts
import { debugLog } from '../../utils';
debugLog(this.plugin, '処理が完了しました', { result: 'success' });
```

### 6.5. 国際化 (i18n)
`src/i18n`の`t`関数を使い、UIテキストを多言語対応させます。`src/i18n/strings/`内のファイルに翻訳キーを追加して使用します。
```ts
import { t, type Language } from '../../i18n';
const lang = this.plugin.settings.language || 'ja';
const message = t(lang, 'myWidget.greeting');
```

---
## 7. LLM（大規模言語モデル）連携

### 7.1. `LlmManager`の利用
`plugin.llmManager`を通じて、プラグインに統合されたAI機能を利用できます。このマネージャーは、APIキーなどの認証情報を抽象化し、シンプルなインターフェースでテキスト生成機能を提供します。

### 7.2. 実装例
`generateReplyWithDefault`メソッドで、プロンプトとコンテキストを渡してテキストを生成します。
```ts
// ウィジェットのメソッド内
async generateAiText(prompt: string): Promise<string> {
  if (!this.plugin.llmManager) {
    throw new Error('LLM Manager is not available.');
  }

  // APIに渡す追加情報があればコンテキストに含める
  const context = {
    widgetId: this.config.id,
    plugin: this.plugin,
  };

  try {
    const reply = await this.plugin.llmManager.generateReplyWithDefault(prompt, context);
    return reply;
  } catch (error) {
    console.error("LLM text generation failed:", error);
    return "Error: Could not generate text.";
  }
}
```

---
## 8. ベストプラクティス・FAQ

### 8.1. ベストプラクティス
- **リソース解放**: `onunload`メソッドで`addEventListener`で登録したリスナーや`setInterval`を必ず解放してください。
- **差分更新**: UIの更新は、全再描画ではなく、変更があった部分のみを更新する差分更新を心がけてください。
- **既存コードの参照**: 新しい機能を実装する際は、類似の既存ウィジェットの実装を参考にしてください。

### 8.2. FAQ
- **Q. 設定や状態が保存されない／復元されない**
  - A. `plugin.saveSettings()`の呼び忘れや、リポジトリクラスでの`save`メソッドの実装漏れの可能性があります。
- **Q. ウィジェットが追加UIに表示されない**
  - A. `widgetRegistry.ts`での登録漏れ、または指定したIDのタイプミスを確認してください。
- **Q. YAMLでウィジェットの大きさ（width/height）を指定できますか？**
  - A. はい。`applyWidgetSize`ユーティリティを`create`メソッド内で使用してください。

### 8.3. セルフチェックリスト
- [ ] ループ内で直接DOMを操作していないか？
- [ ] `onunload`で全てのイベントリスナーとタイマーを解放しているか？
- [ ] 大量データを扱う場合、パフォーマンスへの影響を考慮しているか？
- [ ] DevToolsで意図しないリフローや再描画が発生していないか確認したか？

---
## 9. 引用元ファイル一覧
- `src/interfaces.ts`: `WidgetImplementation`インターフェース定義
- `src/widgetRegistry.ts`: ウィジェット登録機構
- `src/utils/widgetSize.ts`: `createWidgetContainer`, `applyWidgetSize`
- `src/utils/uiHelpers.ts`: `createAccordion`
- `src/utils/renderMarkdownBatch.ts`: Markdownレンダラ
- `src/utils/logger.ts`: デバッグ用ロガー
- `src/i18n/index.ts`: 国際化対応 (`t`関数)
- `src/llm/llmManager.ts`: LLM連携マネージャー
- `src/widgets/tweetWidget/TweetRepository.ts`: 高度なデータ永続化の実装例
- `WIDGET_PERFORMANCE_GUIDE.md`: パフォーマンス最適化設計指針

---
## 10. 高度なアーキテクチャと今後の展望
本プラグインは、責務の分離とユーティリティの活用を基本設計としています。これにより、開発者は自身のウィジェットのコア機能に集中できます。将来的には、より宣言的なUI構築方法や、ウィジェット間の連携を強化する仕組みの導入も視野に入れています。

このガイドが、あなたの創造的なウィジェット開発の一助となることを願っています。

---

## 11. LLM駆動開発のための実装シナリオ

このセクションでは、LLM（大規模言語モデル）アシスタントと対話しながらウィジェット開発を進めることを想定した、具体的な実装フローとプロンプト例を提示します。開発者はこれらのプロンプトをテンプレートとして利用し、自身の要件に合わせてカスタマイズすることで、開発プロセスを大幅に効率化できます。

### 基本的な開発フロー

LLMに指示を出す際の基本的な流れは以下の通りです。

1.  **要件定義 (Prompt)**: 作成したいウィジェットの「名前」「ID」「機能」「設定項目」などを自然言語で明確にLLMへ伝えます。このとき、**参考にしてほしい既存のコードや、従うべき設計ガイドライン（このドキュメントの特定セクションなど）を明記する**ことが重要です。
2.  **コード生成 (LLM)**: LLMは指示に基づき、必要なファイル（ディレクトリ、クラスファイル）の作成、定型コードの実装、各種ファイルへの登録処理など、一連のタスクを自動で実行します。
3.  **レビューと微調整 (Human)**: 生成されたコードを開発者がレビューし、必要に応じて手動で微調整や機能追加を行います。
4.  **イテレーション**: 機能追加や変更がある場合は、再びLLMに指示を出して開発サイクルを回します。

---

### プロンプトテンプレート

#### **テンプレート1: 基本的なウィジェットの骨格生成**

新しいウィジェットの基本的なファイル構造と定型コードを一度に生成するためのプロンプトテンプレートです。`[]`で囲まれたプレースホルダーを自身の要件に合わせて書き換えてください。

**プロンプトの構成要素:**
```
新しいウィジェット「[ウィジェットのクラス名]」を開発します。

# 要件
- ウィジェット名 (クラス名): [YourWidgetName]Widget
- ウィジェットID (登録キー): [your-widget-id]
- 機能概要: [ウィジェットが何をするかの簡単な説明。例: 「ユーザーが設定したメッセージを表示する」]

# 作業指示
1. **`docs/WIDGET_DEV_GUIDE.md` のセクション4.2「実装テンプレート」**を参考に、`src/widgets/[yourWidgetName]/` ディレクトリと `index.ts` ファイルを作成し、`WidgetImplementation`インターフェースを実装してください。
2. `create` メソッド内では、**`src/utils/widgetSize.ts`にある`createWidgetContainer`ユーティリティ**を使用してください。初期のコンテンツは「ここにウィジェットのコンテンツが入ります」といったプレースホルダーで構いません。
3. **`src/widgetRegistry.ts` の既存の実装**に倣って、作成した `[YourWidgetName]Widget` を `[your-widget-id]` というIDで登録してください。
```

#### **テンプレート2: 設定と状態管理を持つウィジェットへの拡張**

基本的なウィジェットに、ユーザー設定機能やデータの永続化機能を追加するためのプロンプトテンプレートです。

**プロンプトの構成要素:**
```
既存のウィジェット「[YourWidgetName]Widget」を拡張し、設定と状態管理機能を追加します。

# 要件
- 対象ウィジェット: `src/widgets/[yourWidgetName]/index.ts`
- 追加機能: [追加したい機能の概要。例: 「メッセージ内容とフォントサイズを設定可能にし、その設定を保存する」]

# 作業指示
## 1. 設定機能の実装
- **`src/settings/defaultWidgetSettings.ts`** を参照し、`[your-widget-id]` ウィジェットのデフォルト設定として、以下の項目を追加してください。
  - [settingKey1]: [defaultValue1]
  - [settingKey2]: [defaultValue2]
- **`docs/WIDGET_DEV_GUIDE.md` のセクション5.1** を参考に、`[YourWidgetName]Widget` クラスを修正してください。
- `updateExternalSettings` メソッドを実装し、設定変更がUIに反映されるようにしてください。UI更新ロジックはプライベートメソッド（例: `updateView`）にカプセル化してください。
- `create` メソッド内で **`src/utils/widgetSize.ts`の`applyWidgetSize`ユーティリティ** を呼び出し、`width`/`height` 設定に対応してください。

## 2. 高度な状態管理 (必要な場合)
- **`docs/WIDGET_DEV_GUIDE.md` のセクション5.2「高度なデータ永続化（リポジトリパターン）」** と、既存の実装 **`src/widgets/tweetWidget/TweetRepository.ts`** を参考に、`[YourWidgetName]Repository.ts` を作成してください。
- 永続化するデータ構造は以下の通りです:
  - [dataKey1]: [dataType1]
  - [dataKey2]: [dataType2]
- ウィジェット本体からリポジトリを呼び出し、データの読み込み（`load`）と保存（`save`）を行う処理を実装してください。
```
