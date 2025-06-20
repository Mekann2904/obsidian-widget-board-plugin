# Obsidian Widget Board Plugin  
## ウィジェット開発マニュアル（最新版・詳細版）

このドキュメントは、現行コードベースに基づき自動生成されています。

---

## 目次

1. 概要（背景・設計思想・全体像）
2. ウィジェット開発フロー（パフォーマンス設計指針を反映・詳細版）
3. ウィジェット登録・管理の仕組み（理論・実装例・FAQ・パフォーマンス観点）
4. ウィジェット実装の最小要件（理論・実装例・パフォーマンス観点・注意点）
5. 設定・状態管理の最新仕様（理論・実装例・注意点）
6. 主要ファイルの役割（詳細解説・パフォーマンス観点・設計例）
7. サンプル実装例（詳細解説・パフォーマンス設計パターン）
8. ベストプラクティス・FAQ（パフォーマンス観点含む実践知・セルフチェック）
9. 引用元（参照ファイル・実装例・パフォーマンスガイド該当章）
10. 高度なアーキテクチャと研究動向

---

## 1. 概要（背景・設計思想・全体像）

### 背景・目的
Obsidian Widget Board Pluginは、Obsidian上で多様なウィジェットを柔軟に追加・管理できる拡張プラットフォームです。ユーザーや開発者が独自のウィジェットを簡単に追加・カスタマイズできるよう、拡張性・保守性・パフォーマンスを重視した設計となっています。

### 設計思想
- **拡張性**：新規ウィジェットの追加・既存ウィジェットのカスタマイズが容易です。
- **一元管理**：全ウィジェット・設定・状態を一元的に管理します。
- **パフォーマンス**：仮想リスト・バッチ描画・containment等の最適化を標準化しています。
- **型安全性**：TypeScriptによる厳密な型定義を行っています。

### 全体構成
- プラグイン本体（main.ts）
- ウィジェット本体（src/widgets/xxxWidget.ts）
 - 登録・管理機構（widgetRegistry.ts, defaultWidgetSettings.ts など）
- UI・設定タブ（settingsTab.ts, modal.ts）
- 型定義（interfaces.ts）

#### 参考リンク
- [Obsidian Plugin API](https://publish.obsidian.md/api/)
- [TypeScript公式](https://www.typescriptlang.org/)

---

## 2. ウィジェット開発フロー（パフォーマンス設計指針を反映・詳細版）

### 背景・理論

ウィジェット開発では「機能性・拡張性」と「パフォーマンス最適化」を両立することが重要です。特にObsidianのようなノートアプリでは、リストやUIの規模が大きくなりやすく、設計段階からパフォーマンス指針（WIDGET_PERFORMANCE_GUIDE.md）を意識することで、後からの大規模リファクタやバグ修正を防げます。

### 推奨フロー（各工程でパフォーマンス観点を明示）

1. **ウィジェットの設計**
    - 機能・UI・設定項目・状態管理方針を明確化
    - 既存ウィジェット・パフォーマンスガイド（WIDGET_PERFORMANCE_GUIDE.md）を必ず参照
    - **パフォーマンス設計指針の検討ポイント例：**
        - ループ内DOM操作のバッチ化（DocumentFragment等）
        - Markdown描画のバッチ化・キャッシュ
        - 仮想リスト化（大量リストの場合）
        - textarea等の自動リサイズ最適化
        - CSS contain, will-change, isolationの活用
        - read→write分離
        - 外部ライブラリ利用時のreflow対策
2. **ファイル作成**
    - `src/widgets/` に新しいウィジェットファイルを作成（例: `myWidget.ts`）
    - ファイル名・クラス名・IDは一貫性を持たせる
3. **ウィジェットクラスの実装**
    - `WidgetImplementation`インターフェースを実装
    - `create()`でDOM生成（DocumentFragmentやバッチ化を意識）
    - `updateExternalSettings()`で外部設定反映
    - `onunload()`でリソース解放
    - 必要に応じてstatic Mapでインスタンス・状態管理
    - **パフォーマンス設計指針の実装例：**
        - ループ内でのappendChildやstyle変更はDocumentFragment等でバッチ化
        - Markdown描画はキャッシュ・バッチ化
        - 大規模リストは仮想リスト化
        - textarea等の自動リサイズはrequestAnimationFrameでバッチ化
        - read→write分離を徹底
        - 親要素にcontain: layout style paint;を付与
        - 外部ライブラリ利用時はcontainやオプションでreflow抑制
4. **widgetRegistry.tsで登録**
    - `registeredWidgetImplementations.set('my-widget', MyWidget);`
    - 登録漏れに注意
5. **デフォルト設定の追加（必要に応じて）**
    - `defaultWidgetSettings.ts`でウィジェットのデフォルトを定義
6. **スタイル追加**
    - `styles.css`にウィジェット用クラスを追加
    - **contain, will-change, isolation等のパフォーマンス系CSSも検討**
7. **動作確認・デバッグ**
    - Obsidian上で追加・動作確認
    - 開発者ツールやNoticeでデバッグ
    - **Chrome DevTools等でreflow・描画コストを必ず計測**
    - パフォーマンスガイドのチェックリストでセルフレビュー

### パフォーマンス設計チェックリスト（開発・レビュー時に必ず確認）
- [ ] ループ内でのappendChildやstyle変更が多発していないか？
- [ ] レイアウト値取得とstyle変更が混在していないか？（read→write分離）
- [ ] 大規模リストは仮想リスト化・バッチ化されているか？
- [ ] Markdown描画はキャッシュ・バッチ化されているか？
- [ ] 親要素にcontain: layout style paint;が付与されているか？
- [ ] 外部ライブラリ利用時のreflow対策がなされているか？
- [ ] textarea等の自動リサイズはバッチ化・最適化されているか？
- [ ] DevTools等でreflow・描画コストを計測したか？

### 注意点・アンチパターン
- パフォーマンス設計指針を無視した実装（ループ内での直接DOM操作、全件DOM化、contain未設定など）は必ず避ける
- 設計・実装・デバッグの各段階でパフォーマンス観点を常に意識する
- チェックリストを満たさない場合は必ず設計・実装を見直す

### ベストプラクティス
- 既存ウィジェット（例：memoWidget, pomodoroWidget）を参考にする
- UIは差分更新方式（updateDisplay等）を推奨
- 設定・状態管理はstatic Mapで一元化

#### 参考リンク
- [Obsidian Plugin開発ガイド](https://marcus.se.net/obsidian-plugin-docs/)

### - **YAML埋め込み時の大きさ指定（width/height）対応**
  すべてのウィジェットで、Markdownコードブロック（```widget-board）のYAML設定で`width`や`height`（例: "320px", "60vh"など）を指定可能です。
  各WidgetImplementationの`create`メソッド内で、`settings.width`/`settings.height`が指定されていれば`widgetEl.style.width/height`に反映してください。

---

## 3. ウィジェット登録・管理の仕組み（理論・実装例・FAQ・パフォーマンス観点）

### 背景・理論

ウィジェットの登録・管理は、拡張性・動的UI生成・設定管理の要です。Mapによる一元管理により、追加UIや設定タブが自動的に拡張され、保守性・拡張性が大きく向上します。

**パフォーマンス設計指針との関係**
- 登録されるウィジェットは、WIDGET_PERFORMANCE_GUIDE.mdの指針（バッチ化・仮想リスト・contain等）を満たすことが推奨されます。
- パフォーマンス要件を満たさないウィジェットは、ユーザー体験や他ウィジェットの動作に悪影響を及ぼす可能性があるため、登録前に必ずセルフレビュー・テストを行ってください。

### 実装例

```ts
import { MyWidget } from './widgets/myWidget';
registeredWidgetImplementations.set('my-widget', MyWidget);
```
- `registeredWidgetImplementations`（Map）は、ウィジェットタイプ名→クラスの対応表
- 追加UIや設定タブはこのMapから動的に選択肢を生成
- Map管理により、ウィジェットの追加・削除・拡張が容易

### パフォーマンス観点での登録・管理のポイント
- Mapに登録する前に、パフォーマンス設計チェックリスト（第2章参照）を必ず確認
- 大規模リストや複雑UIを持つウィジェットは、仮想リスト・バッチ化・contain等の最適化を実装しているか再確認
- 登録後も、DevTools等でreflow・描画コストを定期的に計測

### FAQ
- **Q. 登録しないとどうなる？**
  - A. 追加UIや設定タブに表示されず、ユーザーが利用できません。
- **Q. IDやクラス名の命名規則は？**
  - A. 一貫性を持たせ、他と重複しないようにしてください。
- **Q. 既存ウィジェットの登録例は？**
  - A. `src/widgetRegistry.ts`や`src/widgets/`配下の実装を参照。
- **Q. パフォーマンス設計指針を守らないと？**
  - A. 大規模リストや複雑UIで著しいパフォーマンス劣化・バグの原因となります。

### 注意点・アンチパターン
- Mapへの登録漏れに注意
- 型定義（WidgetImplementation）との整合性を保つ
- パフォーマンス設計指針を満たさないウィジェットは登録しない
- 登録後もパフォーマンス劣化がないか定期的に確認

#### 参考リンク
- [TypeScript: Map](https://www.typescriptlang.org/docs/handbook/maps.html)
- [Obsidian Plugin API: UI拡張](https://publish.obsidian.md/api/)
- [WIDGET_PERFORMANCE_GUIDE.md（本リポジトリ内）]

---

## 4. ウィジェット実装の最小要件（理論・実装例・パフォーマンス観点・注意点）

### 背景・理論

すべてのウィジェットは、共通のインターフェース（WidgetImplementation）を実装することで、プラグイン本体やUIから一貫して管理・操作できるようになっています。これにより、拡張性・保守性・型安全性が担保されます。

**パフォーマンス設計指針との関係**
- WidgetImplementationの各メソッド（特にcreate, updateExternalSettings, onunload）では、WIDGET_PERFORMANCE_GUIDE.mdの指針（バッチ化・仮想リスト・contain等）を必ず意識して実装してください。
- パフォーマンス要件を満たさない実装は、他ウィジェットや全体の動作に悪影響を及ぼす可能性があります。

### 実装例

```ts
import type { WidgetImplementation, WidgetConfig } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export class MyWidget implements WidgetImplementation {
  id = 'my-widget';
  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    // DocumentFragment等でバッチ化したDOM生成例
    const fragment = document.createDocumentFragment();
    // ...ノード生成・append...
    const container = document.createElement('div');
    container.appendChild(fragment);
    // contain: layout style paint; などのパフォーマンス系CSSも付与
    container.style.contain = 'layout style paint';
    return container;
  }
  updateExternalSettings(newSettings: any, widgetId?: string) {
    // 設定変更時の差分更新・バッチ化を意識
  }
  onunload?() {
    // リソース解放・イベント解除
  }
}
```
- createでDocumentFragment等によるバッチ化、contain等のパフォーマンス系CSS付与を推奨
- updateExternalSettingsでは差分更新・バッチ化を意識
- onunloadでイベントリスナーやタイマーを必ず解放

### パフォーマンス観点での実装要件
- ループ内でのappendChildやstyle変更はDocumentFragment等でバッチ化
- Markdown描画はキャッシュ・バッチ化
- 大規模リストは仮想リスト化
- textarea等の自動リサイズはrequestAnimationFrameでバッチ化
- read→write分離を徹底
- 親要素にcontain: layout style paint;を付与
- 外部ライブラリ利用時はcontainやオプションでreflow抑制

### 注意点・アンチパターン
- idの重複や命名ミスに注意
- onunloadでイベントリスナーやタイマーを必ず解放
- createで返すDOMは必ず新規生成し、外部から参照されないようにする
- パフォーマンス設計指針（バッチ化・仮想リスト・contain等）を必ず実装に反映

### ベストプラクティス
- 型定義（interfaces.ts）を必ず参照
- 既存ウィジェットの実装例を活用
- パフォーマンスガイドの各章を実装時に再確認
- 実装後はパフォーマンス設計チェックリスト（第2章）でセルフレビュー

#### 参考リンク
- [TypeScript: Interface](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [WIDGET_PERFORMANCE_GUIDE.md（本リポジトリ内）]

### - **YAMLでの大きさ指定対応**
  `create(config, ...)`内で`config.settings.width`や`config.settings.height`が指定されていれば、
  `this.widgetEl.style.width = settings.width;`
  `this.widgetEl.style.height = settings.height;`
  のように反映してください。
  例:
  ```ts
  const settings = (config.settings || {}) as any;
  if (settings.width) this.widgetEl.style.width = settings.width;
  if (settings.height) this.widgetEl.style.height = settings.height;
  ```

---

## 5. 設定・状態管理の最新仕様（理論・実装例・注意点）

### 背景・理論
ウィジェットの設定・状態は、グローバル設定（main.ts）と各ウィジェット個別設定（config.settings）で一元管理されます。これにより、永続化・復元・UI反映が容易になり、複数ウィジェットの同時管理も安全に行えます。

### 実装例
- グローバル設定：`main.ts`の`settings: PluginGlobalSettings`
- 各ウィジェット設定：`config.settings`（WidgetConfig型）
- インスタンス・状態管理：static Mapを活用
```ts
private static widgetInstances: Map<string, MyWidget> = new Map();
private static widgetStates: Map<string, any> = new Map();
```
- 永続化：`plugin.saveSettings(boardId)`で保存

### 注意点・アンチパターン
- 設定・状態の直接書き換えは避け、必ず専用メソッド経由で
- IDは自動生成されるため手動変更しない
- 設定反映後はUIの再描画・差分更新を忘れずに

### ベストプラクティス
- 設定・状態の型を厳密に定義
- 設定変更時は必ず`plugin.saveSettings()`を呼ぶ

#### 参考リンク
- [Obsidian Plugin API: Settings](https://publish.obsidian.md/api/Plugin#settings)

---

## 6. 主要ファイルの役割（詳細解説・パフォーマンス観点・設計例）

### 背景・理論

各ファイルは役割分担が明確で、責務の分離により保守性・拡張性・パフォーマンス最適化が高まっています。パフォーマンス設計指針（WIDGET_PERFORMANCE_GUIDE.md）に従った責務分担・設計を徹底してください。

### 主要ファイル一覧とパフォーマンス観点

- **main.ts**
  - プラグイン本体。設定・ボード・ウィジェットの管理、永続化、UI起動などの中枢。
  - グローバル設定・状態の一元管理、パフォーマンス最適化の基盤。
- **settingsTab.ts**
  - 設定タブUI。ボード・ウィジェットの追加/編集/削除、ユーザーインターフェース全般。
  - UIの差分更新・バッチ化・contain等のパフォーマンス指針を反映。
- **widgetRegistry.ts**
  - ウィジェットの一覧・登録。Mapによる一元管理。
  - パフォーマンス要件を満たすウィジェットのみ登録すること。
 - **defaultWidgetSettings.ts**
   - 各ウィジェットのデフォルト設定をまとめたファイル。
- **modal.ts**
  - ウィジェットボードのモーダルUI、ウィジェット追加モーダル。
  - リスト描画・UI更新時は仮想リスト・バッチ化・contain等を検討。
- **widgets/xxxWidget.ts**
  - 各ウィジェット本体。WidgetImplementation実装。
  - バッチ化・仮想リスト・contain等のパフォーマンス最適化を必ず実装。
- **interfaces.ts**
  - 型定義。WidgetImplementation, WidgetConfig, 各種設定型など。
  - 型安全性・拡張性の基盤。
- **WIDGET_PERFORMANCE_GUIDE.md**
  - パフォーマンス最適化設計指針。全開発者必読。

### パフォーマンス観点での責務分離・設計例
- 各ファイル・クラスは「UI描画」「状態管理」「設定管理」などの責務を明確に分離
- UI描画・リスト更新・Markdown描画等は必ずバッチ化・仮想リスト・contain等を検討
- 設定・状態管理はmain.tsやstatic Mapで一元化し、UI更新時は差分更新・バッチ化を徹底

### 注意点・アンチパターン
- 役割が重複しないよう、責務分離を徹底
- 主要ファイルの変更時は他ファイルへの影響を必ず確認
- パフォーマンス設計指針の観点で責務分担・設計を見直す

### ベストプラクティス
- 既存ファイルの実装・コメントを積極的に参照
- 新規ファイル追加時は命名規則・責務分担・パフォーマンス設計を守る
- ファイルごとにパフォーマンスガイドの該当章を確認

#### 参考リンク
- [Obsidian Plugin API: File structure](https://publish.obsidian.md/api/)
- [WIDGET_PERFORMANCE_GUIDE.md（本リポジトリ内）]

---

## 7. サンプル実装例（詳細解説・パフォーマンス設計パターン）

### サンプル実装例のポイント
- すべてのサンプルはパフォーマンス設計指針（バッチ化・仮想リスト・contain等）を意識して実装
- ループ内DOM操作やリスト描画、Markdown描画、リサイズ処理などは必ずパフォーマンス最適化を反映
- サンプルをベースに、各ウィジェットの仕様・UIに合わせて拡張

---

### widgetRegistry.tsでの登録例
```ts
import { MyWidget } from './widgets/myWidget';
registeredWidgetImplementations.set('my-widget', MyWidget);
```
- Mapによる一元管理で、追加UIや設定タブが自動拡張される
- パフォーマンス要件を満たすウィジェットのみ登録

---

### 新規ウィジェットクラスの実装例（バッチ化・contain等を明示）
```ts
import type { WidgetImplementation, WidgetConfig } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export class MyWidget implements WidgetImplementation {
  id = 'my-widget';
  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    // DocumentFragmentでバッチ化
    const fragment = document.createDocumentFragment();
    for (const item of config.settings.items ?? []) {
      const li = document.createElement('li');
      li.textContent = item;
      fragment.appendChild(li);
    }
    const container = document.createElement('div');
    container.appendChild(fragment);
    // contain: layout style paint; でreflow波及を防止
    container.style.contain = 'layout style paint';
    return container;
  }
  updateExternalSettings(newSettings: any, widgetId?: string) {
    // 設定変更時の差分更新・バッチ化を意識
  }
  onunload?() {
    // リソース解放・イベント解除
  }
}
```
- createでDocumentFragment等によるバッチ化、contain等のパフォーマンス系CSS付与を推奨
- updateExternalSettingsでは差分更新・バッチ化を意識
- onunloadでイベントリスナーやタイマーを必ず解放

---

### インスタンス・状態管理例
```ts
private static widgetInstances: Map<string, MyWidget> = new Map();
private static widgetStates: Map<string, any> = new Map();
```
- static Mapでインスタンス・状態を一元管理
- 状態変更時もバッチ化・差分更新・contain等を意識

---

### 注意点・解説
- サンプルはパフォーマンス設計指針（WIDGET_PERFORMANCE_GUIDE.md）を必ず参照し、バッチ化・仮想リスト・contain等を実装に反映
- static MapのキーはwidgetId等のユニーク値を使用
- サンプルをベースに、各ウィジェットの仕様・UIに合わせて拡張
- 状態変更・UI更新時もパフォーマンス観点で設計・実装

---

### - **YAMLで大きさ指定が可能なサンプル**
  ```ts
  // 追加: YAMLで大きさ指定があれば反映
  const settings = (config.settings || {}) as any;
  if (settings.width) this.widgetEl.style.width = settings.width;
  if (settings.height) this.widgetEl.style.height = settings.height;
  ```

---

## 8. ベストプラクティス・FAQ（パフォーマンス観点含む実践知・セルフチェック）

### ベストプラクティス（パフォーマンス観点を重視）
- **IDやMapによるインスタンス管理はメモリ上のみ。永続化は必ず`plugin.saveSettings()`で行う**
- **設定UIや追加UIは`registeredWidgetImplementations`の内容に依存。登録漏れに注意**
- **onunloadでイベントリスナーやリソースを必ず解放**
- **UIは差分更新方式（updateDisplay等）を推奨し、全再描画を避ける**
- **デバッグはObsidianの開発者ツールやNoticeを活用**
- **型定義や既存ウィジェットの実装を積極的に参照**
- **パフォーマンスガイド（WIDGET_PERFORMANCE_GUIDE.md）の各章を必ず実装・レビュー時に確認**
- **パフォーマンス計測・自動テストも推奨（DevTools, Lighthouse, Puppeteer等）**
- **状態変更・UI更新時はバッチ化・差分更新・contain等のパフォーマンス指針を徹底**

### FAQ（パフォーマンス設計指針を踏まえたよくある質問）
- **Q. 設定や状態が保存されない／復元されない**
  - A. `plugin.saveSettings()`の呼び忘れや、IDの重複・不整合が原因の場合が多いです。
- **Q. ウィジェットが追加UIに表示されない**
  - A. `widgetRegistry.ts`での登録漏れ、IDの重複・タイプミスを確認してください。
- **Q. UIが正しく更新されない**
  - A. 設定変更後にUIの再描画（updateDisplay等）やバッチ化・差分更新を忘れていないか確認。
- **Q. onunloadで何をすべき？**
  - A. イベントリスナー・タイマー・外部リソースの解放を必ず行ってください。
- **Q. パフォーマンス設計指針はどこで確認できる？**
  - A. プロジェクトルートのWIDGET_PERFORMANCE_GUIDE.mdを参照してください。
- **Q. パフォーマンス劣化の兆候は？**
  - A. DevToolsのPerformanceタブでreflow・paint・scriptingコストが高い場合や、UIの遅延・カクつきが発生した場合は要注意です。
- **Q. YAMLでウィジェットの大きさ（width/height）を指定できますか？**
  A. すべてのウィジェットで`settings.width`や`settings.height`をYAMLで指定できます。
  例:
  ```widget-board
  type: memo
  settings:
    width: "320px"
    height: "200px"
  ```

### セルフチェック例（開発・レビュー時に必ず確認）
- [ ] ループ内でのappendChildやstyle変更が多発していないか？
- [ ] レイアウト値取得とstyle変更が混在していないか？（read→write分離）
- [ ] 大規模リストは仮想リスト化・バッチ化されているか？
- [ ] Markdown描画はキャッシュ・バッチ化されているか？
- [ ] 親要素にcontain: layout style paint;が付与されているか？
- [ ] 外部ライブラリ利用時のreflow対策がなされているか？
- [ ] textarea等の自動リサイズはバッチ化・最適化されているか？
- [ ] DevTools等でreflow・描画コストを計測したか？

### 注意点・アンチパターン
- パフォーマンス設計指針を無視した実装（ループ内での直接DOM操作、全件DOM化、contain未設定など）は必ず避ける
- 設計・実装・デバッグの各段階でパフォーマンス観点を常に意識する
- チェックリストを満たさない場合は必ず設計・実装を見直す

#### 参考リンク
- [Obsidian Plugin開発FAQ](https://marcus.se.net/obsidian-plugin-docs/faq/)
- [WIDGET_PERFORMANCE_GUIDE.md（本リポジトリ内）]

---

## 9. 引用元（参照ファイル・実装例・パフォーマンスガイド該当章）

- `src/interfaces.ts`：WidgetImplementationインターフェース定義、型安全設計の基盤
- `src/widgetRegistry.ts`：ウィジェット登録・Map管理、パフォーマンス要件を満たすウィジェットのみ登録
- `src/modal.ts`：ウィジェット追加UI、リスト描画・UI更新時のバッチ化・仮想リスト・contain等の実装例
- `src/settingsTab.ts`：設定タブUI、差分更新・バッチ化・contain等の実装例
- `src/widgets/pomodoro/index.ts`：static Mapによるインスタンス・状態管理、onunload, updateDisplay等、パフォーマンス最適化例
- `src/widgets/memo/index.ts`：同上
- `src/main.ts`：全体設定・永続化、グローバル状態管理の実装例
- `WIDGET_PERFORMANCE_GUIDE.md`：パフォーマンス最適化設計指針（全章必読、各章の実装例・設計例も参照）

---

ご不明点や追加情報が必要な場合は、既存ウィジェットや主要ファイルの実装例、WIDGET_PERFORMANCE_GUIDE.mdを参照してください。

## 10. 高度なアーキテクチャ

### 10.1 設計理論の背景

近年のWebアプリケーション研究では、仮想DOMやリアクティブプログラミングによる状態管理手法が注目されています。本プラグインでも、これらの知見を応用し、複雑なUI更新を効率的に行うための差分描画やImmutableデータ構造の利用を推奨しています。レンダリングパイプライン最適化やレイテンシ隠蔽に関する研究成果は、WIDGET_PERFORMANCE_GUIDE.mdの基盤にもなっています。

### 10.2 メモリ管理と計測

Electron環境では、メモリリークやGCコストがパフォーマンスに直結します。ウィジェット実装時には、開発者ツールのメモリプロファイラを活用して不要なオブジェクトが残存していないか検証してください。必要に応じて`WeakRef`や`FinalizationRegistry`などの機能を取り入れ、オブジェクトのライフサイクルを明確にすることが望まれます。

### 10.3 将来展望

WebGPUによる高速レンダリングやWASMによる計算オフロードなど、フロントエンドの研究は急速に進展しています。プラグインを長期的に発展させるため、アーキテクチャをモジュール化し、これら先端技術との統合を視野に入れた設計を検討すると良いでしょう。
