# パフォーマンス最適化ガイド（決定版）

## 1. はじめに：なぜパフォーマンスが重要か

Obsidianは日々の思考を支えるツールであり、その上で動作するプラグインの軽快さはユーザー体験に直結します。特に、複数のウィジェットを同時に表示する本プラグインでは、一つ一つのウィジェットが高いパフォーマンス意識を持つことが不可欠です。

このガイドは、ウィジェット開発において遭遇しうるパフォーマンスのボトルネックを特定し、それを解決するための具体的な設計指針と実装パターンを提供します。

**パフォーマンス最適化の三大原則:**
1.  **Reflow/Repaintの最小化**: DOMの変更はコストが高い処理です。変更をまとめて一度に行う「バッチ処理」を徹底します。
2.  **レンダリングの効率化**: 表示する必要のないDOMは生成せず、表示されているものも効率的に描画・キャッシュします。
3.  **重い処理のオフロードとスケジューリング**: UIをブロックする可能性のある重い処理はメインスレッドから切り離すか、アイドル時間に実行します。

---

## 2. DOM操作の最適化：Reflowを制する

### 2.1. `DocumentFragment`によるDOMのバッチ追加

#### 背景・理論
`appendChild`などのDOM操作をループ内で実行すると、その都度レイアウト計算（Reflow）と再描画（Repaint）が発生し、パフォーマンスが著しく低下します。`DocumentFragment`は、メモリ上でDOMノードをまとめてから、一度の`appendChild`で実際のDOMに追加するための軽量なコンテナです。これにより、ReflowとRepaintを最後の1回に抑えることができます。

#### 推奨される対応
リストなど複数の要素を動的に追加する場合は、必ず`DocumentFragment`を利用して一括でDOMに追加してください。

#### 実装例
```javascript
// NG例：ループ内で直接appendChild
const parentEl = document.getElementById('list');
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item;
  parentEl.appendChild(li); // ループの度にReflowが発生
}

// OK例：DocumentFragmentでバッチ追加
const parentEl = document.getElementById('list');
const fragment = document.createDocumentFragment();
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item;
  fragment.appendChild(li); // メモリ上での操作なのでReflowは発生しない
}
parentEl.appendChild(fragment); // ここで1回だけReflowが発生
```

### 2.2. Read/Writeの分離によるレイアウトスラッシングの防止

#### 背景・理論
ブラウザは、JavaScriptによるDOMのスタイル変更を効率化するため、一度にまとめて実行しようとします。しかし、ループ内でDOMのサイズや位置を取得する処理（Read）と、スタイルを変更する処理（Write）が交互に発生すると、ブラウザは正確な値を返すために強制的にレイアウト計算を実行せざるを得なくなります。この現象は「レイアウトスラッシング」と呼ばれ、深刻なパフォーマンス低下を引き起こします。

#### 推奨される対応
まずループで全ての要素のレイアウト値（Read）を先にすべて読み取ってから、別のループで全ての要素のスタイル（Write）を変更してください。

#### 実装例
```javascript
// NG例：ループ内でRead/Writeが交互に発生
for (const el of elements) {
  const rect = el.getBoundingClientRect(); // Read
  el.style.width = rect.width + 10 + 'px'; // Write → 強制Reflow
}

// OK例：ReadとWriteを分離
const widths = [];
// Readフェーズ
for (const el of elements) {
  widths.push(el.getBoundingClientRect().width);
}
// Writeフェーズ
for (let i = 0; i < elements.length; i++) {
  elements[i].style.width = (widths[i] + 10) + 'px';
}
```

---

## 3. レンダリングの最適化

### 3.1. Markdownレンダリングのキャッシュ活用

#### 背景・理論
Obsidianの`MarkdownRenderer.render`は高機能である一方、コストの高い処理です。同じ内容のMarkdownを何度も描画する場合、毎回レンダリングするのは非常に非効率です。

#### 推奨される対応
`src/utils/renderMarkdownBatch.ts`にある専用ユーティリティ`renderMarkdownBatchWithCache`を使用してください。この関数は、レンダリング結果を内部でキャッシュ（LRU方式）し、2回目以降の描画を高速化します。

#### 実装例
```ts
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { Component } from 'obsidian';

// レンダラのライフサイクルを管理するためにComponentインスタンスを渡します
const component = new Component(); 
// ...
// この関数を呼ぶだけで、自動的にキャッシュが利用されます
await renderMarkdownBatchWithCache(markdownText, container, '', component);
// ...
// ウィジェットが破棄されるタイミングで、必ずコンポーネントをアンロードします
component.unload();
```

### 3.2. 大規模リストの仮想化

#### 背景・理論
数百件を超えるような大量のリストを全てDOMとして描画すると、メモリ消費と初回描画時のReflowコストが甚大になります。仮想リスト（Virtual Scrolling）は、画面に見えている範囲と、その上下のわずかなバッファ範囲だけをDOMとして描画し、スクロールに合わせて要素を再利用する技術です。

#### 推奨される対応
100件を超える可能性のあるリストでは、仮想リストの導入を検討してください。`recent-notes/index.ts`では、この技術を応用し、表示件数に上限を設けることで過剰なDOM生成を抑制しています。

### 3.3. CSS Containmentによる描画範囲の限定

#### 背景・理論
ある要素のスタイルが変更された際、ブラウザはその影響がどこまで及ぶかを確認するために、広範囲のレイアウト計算を行うことがあります。CSSの`contain`プロパティは、ブラウザに「この要素の変更は、この要素の内部に閉じていて外部に影響を与えない」と伝えることで、計算範囲を限定し、パフォーマンスを向上させます。

#### 推奨される対応
コンテンツが頻繁に更新されるウィジェットの親要素や、内容が外部に影響を与えないコンテナ要素には、`contain: layout style paint;`を指定してください。

---

## 4. 非同期処理とスケジューリング

### 4.1. Web Workerによる重い処理のオフロード

#### 背景・理論
Mermaid.jsのように、JavaScriptで完結する重い処理（例：複雑なパース、グラフ描画計算）は、メインスレッドを長時間ブロックし、UI全体の応答性を著しく低下させる原因となります。Web Workerを使用すると、これらの処理をバックグラウンドのスレッドで実行できるため、メインスレッドはUIの応答性を保ったまま他のタスクを処理できます。

#### 推奨される対応
サードパーティライブラリを使った重いクライアントサイド処理は、Web Workerへのオフロードを検討してください。本プラグインではMermaidのレンダリングにこの技術を適用しています。

#### 実装例（Mermaidレンダリング）
`src/utils/mermaidRenderWorkerClient.ts`と`src/utils/mermaidWorker.ts`が実装例です。

**呼び出し側 (Client)**
```ts
import { renderMermaidInWorker } from './utils/renderMermaidInWorker';

// Workerを呼び出して、MermaidコードからSVGを非同期で生成
const svg = await renderMermaidInWorker(mermaidCode, 'unique-mermaid-id');
container.innerHTML = svg;
```

**Worker側 (`mermaidWorker.ts`)**
```ts
// CDNからMermaidライブラリを読み込む
self.importScripts('https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js');

// メッセージを受け取ってレンダリングを実行し、結果を返す
self.onmessage = async (e) => {
  const { code, id } = e.data;
  // ... レンダリング処理 ...
  self.postMessage({ svg, id });
};
```
これにより、Mermaidのレンダリング中もUIは固まりません。

### 4.2. `requestIdleCallback`による事前キャッシュ（プリウォーム）

#### 背景・理論
ユーザーがウィジェットを実際に表示する前に、その内容をバックグラウンドで 미리レンダリングしておく（プリウォームする）ことで、表示時の体感速度を大幅に向上させることができます。しかし、この処理が起動時に集中すると、逆にアプリケーション全体の起動を遅らせてしまいます。`requestIdleCallback`は、ブラウザがアイドル状態（他に重要なタスクがない時）になったタイミングで処理を実行させるためのAPIです。

#### 推奨される対応
プラグイン起動時など、緊急性の低いが将来的に必要になるデータ（特にMarkdownレンダリングなど）のキャッシュ生成には、`requestIdleCallback`を使ったプリウォームを実装してください。

#### 実装例 (`src/prewarm.ts`より)
```ts
// ... 各ウィジェットからキャッシュ対象のコンテンツを集める ...

const schedule = (cb: () => void) => {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(cb);
    } else {
        // フォールバックとしてrequestAnimationFrameを使用
        requestAnimationFrame(cb);
    }
};

const processBatch = async () => {
    // 一度に処理する量を制限（例：3件ずつ）
    const batch = getNextBatchOfMarkdownContents(3); 
    
    for (const content of batch) {
        // キャッシュ生成（この時DOMには追加しない）
        await renderMarkdownBatchWithCache(content, document.createElement('div'), '', new Component());
    }

    if (hasMoreContentToProcess()) {
        // まだ処理が残っていれば、次のアイドル時間にもう一度実行
        schedule(processBatch);
    } else {
        new Notice('キャッシュが完了しました');
    }
};

// 最初のバッチ処理をスケジューリング
schedule(processBatch);
```

### 4.3. `requestAnimationFrame`による高頻度イベントの間引き

#### 背景・理論
`input`, `mousemove`, `resize`のような高頻度で発火するイベント内でDOMのRead/Writeを行うと、レイアウトスラッシングを引き起こし、UIがカクつく原因となります。`requestAnimationFrame`は、ブラウザの次の描画タイミングでコードを実行するようスケジューリングする機能で、1フレームに何度も発生するイベントを1回の描画更新にまとめることができます。

#### 推奨される対応
高頻度イベントでのDOM更新は、必ず`requestAnimationFrame`でバッチ処理してください。

#### 実装例 (textareaの自動リサイズ)
```javascript
let resizeQueued = false;
textarea.addEventListener('input', () => {
  if (!resizeQueued) {
    resizeQueued = true;
    requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      resizeQueued = false; // 次のフレームまで再実行しない
    });
  }
});
```
---

## 5. 状態管理と差分更新

#### 背景・理論
ウィジェットの設定が変更された際に、毎回ウィジェット全体を破棄して再生成するのは非常に非効率です。DOMの再生成はコストが高く、ユーザーの入力状態（スクロール位置など）も失われます。理想的なのは、変更があった部分だけを最小限のDOM操作で更新する「差分更新」です。

#### 推奨される対応
ウィジェットに`update`のようなメソッドを実装し、古い設定と新しい設定を比較して、変更があった部分だけを更新するロジックを実装してください。これにより、不要な再描画を防ぎ、パフォーマンスとUXを向上させます。

#### 実装例 (`memo/index.ts` の設計思想)
```ts
// WidgetBoardModal側 (概念コード)
function onSettingsChanged(newConfig: WidgetConfig) {
    const widgetInstance = allWidgets.get(newConfig.id);
    // 毎回作り直すのではなく、updateを呼ぶ
    widgetInstance.update(newConfig); 
}

// 各ウィジェット側 (memo/index.ts)
class MemoWidget implements WidgetImplementation {
    private currentSettings: MemoWidgetSettings;

    public update(newConfig: WidgetConfig) {
        const newSettings = newConfig.settings as MemoWidgetSettings;

        // 例：メモの内容が変更された場合のみ、描画処理を呼び出す
        if (this.currentSettings.memoContent !== newSettings.memoContent) {
            this.renderMemo(newSettings.memoContent);
        }

        // 例：高さモードが変更された場合のみ、スタイルを適用し直す
        if (this.currentSettings.memoHeightMode !== newSettings.memoHeightMode) {
            this.applyContainerHeightStyles();
        }

        this.currentSettings = newSettings;
    }
    // ...
}
```

---

## 6. メモリ管理とクリーンアップ

#### 背景・理論
JavaScriptではガベージコレクションが自動的に行われますが、不要になったオブジェクトへの参照が残り続けていると、メモリが解放されずに蓄積していきます（メモリリーク）。特に、イベントリスナーやタイマーは、明示的に解除しない限り、ウィジェットのDOM要素が削除された後もメモリ上に残り続ける代表的な原因です。

#### 推奨される対応
Obsidianのライフサイクルに従い、ウィジェットの`onunload`メソッド内で、そのウィジェットが使用していたリソースをすべてクリーンアップしてください。これは安定したプラグイン動作のために**必須の対応**です。

#### クリーンアップ処理のチェックリスト
`onunload`メソッドで、以下の処理を必ず実行してください。

- **イベントリスナーの解除**: `addEventListener`で登録したリスナーは、`removeEventListener`で必ず解除します。
  ```ts
  // memo/index.ts の例
  onunload() {
      this.removeMemoEditAreaAutoResizeListener(); // ここでリスナーを解除
  }

  private removeMemoEditAreaAutoResizeListener() {
      if (this.memoEditAreaEl && this._memoEditAreaInputListener) {
          this.memoEditAreaEl.removeEventListener('input', this._memoEditAreaInputListener);
          this._memoEditAreaInputListener = null;
      }
  }
  ```
- **タイマーのクリア**: `setInterval`や`setTimeout`で生成したタイマーは、`clearInterval`や`clearTimeout`で解除します。
- **`MutationObserver`の停止**: `observe`しているObserverは、`disconnect`で停止します。
- **外部ライブラリのインスタンス破棄**: Chart.jsなどのライブラリを使用している場合、そのライブラリが提供する`destroy()`メソッドなどを呼び出します。
- **子`Component`のアンロード**: `new Component()`で子コンポーネントを作成した場合、その`unload()`を呼び出します。

---

## 7. 外部要素との連携と計測

### 7.1. 外部ライブラリ利用時の注意
Chart.jsのようなライブラリは、内部で複雑な計算とDOM操作を行います。ライブラリが提供するパフォーマンス関連のオプション（例: アニメーションの無効化）を積極的に利用し、`onunload`でのリソース解放を徹底してください。

### 7.2. パフォーマンスの計測とテスト
パフォーマンスは感覚ではなく、必ずツールを使って定量的に計測してください。
- **ツール**: Chrome DevToolsの**Performance**タブと**Memory**タブ。
- **確認項目**:
    -   Layout（紫）やPainting（緑）のブロックが予期せぬ場所で長くなっていないか。
    -   Memoryタブでスナップショットを比較し、ウィジェットの開閉を繰り返した後にメモリ使用量が増え続けていないか（メモリリークの兆候）。

---
本資料は、今後の開発・リファクタ・レビュー時の指針としてご活用ください。
