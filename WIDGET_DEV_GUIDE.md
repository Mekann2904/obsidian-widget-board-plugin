# Obsidian Widget Board Plugin  
## ウィジェット開発マニュアル（最新版）

このドキュメントは、現行コードベースに基づき自動生成されました。

---

## 目次

1. 概要
2. ウィジェット開発フロー
3. ウィジェット登録・管理の仕組み
4. ウィジェット実装の最小要件
5. 設定・状態管理の最新仕様
6. 主要ファイルの役割
7. サンプル実装例
8. ベストプラクティス・FAQ
9. 引用元

---

## 1. 概要

このガイドは、Obsidian Widget Board Plugin用のウィジェットを新規開発・カスタマイズするための最新手順・仕様をまとめたものです。

---

## 2. ウィジェット開発フロー

1. **ウィジェットの設計**
    - 機能・UI・設定項目を決める
2. **ファイル作成**
    - `src/widgets/` に新しいウィジェットファイルを作成（例: `myWidget.ts`）
3. **ウィジェットクラスの実装**
    - `WidgetImplementation`インターフェースを実装
    - `create()`でDOM生成、`updateExternalSettings()`で外部設定反映、`onunload()`でクリーンアップ[†1]
4. **widgetRegistry.tsで登録**
    - `registeredWidgetImplementations.set('my-widget', MyWidget);`[†2]
5. **デフォルト設定の追加（必要に応じて）**
    - `settingsDefaults.ts`でデフォルト設定を定義
6. **スタイル追加**
    - `styles.css`にウィジェット用クラスを追加
7. **動作確認・デバッグ**
    - Obsidian上で追加・動作確認

---

## 3. ウィジェット登録・管理の仕組み

- **ウィジェットの登録**は`src/widgetRegistry.ts`で行う[†2]
    - 例：
      ```ts
      import { MyWidget } from './widgets/myWidget';
      registeredWidgetImplementations.set('my-widget', MyWidget);
      ```
- **registeredWidgetImplementations**（Map）は、ウィジェットタイプ名→クラスの対応表
- **ウィジェット追加UI**や設定タブはこのMapから動的に選択肢を生成[†3]
- **新規追加時の流れ**：
    1. `src/widgets/`にファイル作成
    2. クラス実装
    3. `widgetRegistry.ts`で登録
    4. 必要に応じてデフォルト設定を`settingsDefaults.ts`で定義

---

## 4. ウィジェット実装の最小要件

- `WidgetImplementation`インターフェースを実装すること[†1]
    - `id: string`（ウィジェット種別ID）
    - `create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement`
    - `updateExternalSettings?(newSettings: any, widgetId?: string): void`（外部から設定変更を受けたときの反映）
    - `onunload?(): void`（リソース解放・イベント解除など）
- `WidgetConfig`型（`interfaces.ts`参照）
    - `id`, `type`, `title`, `settings` など
- **インスタンス・状態管理**
    - 各ウィジェットクラスで`static widgetInstances: Map<string, ...>`や`static widgetStates: Map<string, ...>`を使う[†4]
    - 例：
      ```ts
      private static widgetInstances: Map<string, MyWidget> = new Map();
      private static widgetStates: Map<string, any> = new Map();
      ```

---

## 5. 設定・状態管理の最新仕様

- **全体設定・ボード・ウィジェットの設定は`main.ts`の`settings`（`PluginGlobalSettings`型）で一元管理**[†5]
- **各ウィジェットの状態・設定は`config.settings`で管理**[†4]
- **インスタンス・状態管理**は各ウィジェットクラスのstatic Mapで行う[†4]
- **永続化**は`plugin.saveSettings(boardId)`で行う[†5]
- **設定タブや追加UIは`registeredWidgetImplementations`の内容に依存**[†3]
- **IDは自動生成されるので手動変更しないこと**

---

## 6. 主要ファイルの役割

- `main.ts`：プラグイン本体。設定・ボード・ウィジェットの管理、永続化、UI起動など[†5]
- `settingsTab.ts`：設定タブUI。ボード・ウィジェットの追加/編集/削除[†6]
- `widgetRegistry.ts`：ウィジェットの一覧・登録[†2]
- `settingsDefaults.ts`：デフォルト設定の定義
- `modal.ts`：ウィジェットボードのモーダルUI、ウィジェット追加モーダル[†3]
- `widgets/xxxWidget.ts`：各ウィジェット本体[†4]
- `interfaces.ts`：型定義[†1]

---

## 7. サンプル実装例

### widgetRegistry.ts
```ts
import { MyWidget } from './widgets/myWidget';
registeredWidgetImplementations.set('my-widget', MyWidget);
```

### 新規ウィジェットクラス
```ts
import type { WidgetImplementation, WidgetConfig } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export class MyWidget implements WidgetImplementation {
  id = 'my-widget';
  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    // DOM生成処理
    return document.createElement('div');
  }
  updateExternalSettings(newSettings: any, widgetId?: string) {
    // 外部から設定変更を受けたときの反映処理
  }
  onunload?() {
    // リソース解放・イベント解除など
  }
}
```

### インスタンス・状態管理例
```ts
private static widgetInstances: Map<string, MyWidget> = new Map();
private static widgetStates: Map<string, any> = new Map();
```

---

## 8. ベストプラクティス・FAQ

- **IDやMapによるインスタンス管理はメモリ上のみ。永続化は必ず`plugin.saveSettings()`で行う**[†4][†5]
- **設定UIや追加UIは`registeredWidgetImplementations`の内容に依存。登録漏れに注意**[†2][†3]
- **onunloadでイベントリスナーやリソースを必ず解放**[†4]
- **UIは差分更新方式（updateDisplay等）を推奨**[†4]
- **デバッグはObsidianの開発者ツールやNoticeを活用**[†4][†5]
- **詳細は各ウィジェットの既存実装や`interfaces.ts`を参照**[†1][†4]

---

## 9. 引用元

[†1] `src/interfaces.ts`（11-19行目）WidgetImplementationインターフェース定義  
[†2] `src/widgetRegistry.ts`（全体、特に13-19行目）ウィジェット登録  
[†3] `src/modal.ts`（13-52行目、AddWidgetModalクラス）、`src/settingsTab.ts`（445行目以降、createAddButtonToBoard関数）ウィジェット追加UI  
[†4] `src/widgets/pomodoroWidget.ts`（53行目以降）、`src/widgets/memoWidget.ts`（24行目以降）static Mapによるインスタンス・状態管理、onunload, updateDisplay等  
[†5] `src/main.ts`（1-200行目、クラス定義部とsaveSettings, loadSettings）全体設定・永続化  
[†6] `src/settingsTab.ts`（1-909行目）設定タブUI  

ご不明点や追加情報が必要な場合は、既存ウィジェットや主要ファイルの実装例を参照してください。 