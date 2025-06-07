# Obsidianウィジェットボードプラグイン
## パフォーマンス最適化設計指針・実施履歴（詳細版）

---

### 1. DocumentFragmentによるDOMバッチ追加

#### 背景・理論
DOM操作（特にappendChildやimportNode）は、都度reflow・再描画が発生しやすく、ループ内で大量に実行するとパフォーマンスが大きく低下します。DocumentFragmentは「軽量な仮想DOMコンテナ」として機能し、複数ノードを一時的にまとめてから一括でDOMに追加することで、reflow・repaintの回数を最小限に抑えることができます。

#### 実装例

**NG例：ループ内で直接appendChildです**
```js
const parent = document.getElementById('list');
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item;
  parent.appendChild(li); // ここで毎回reflow
}
```

**OK例：DocumentFragmentでバッチ追加です**
```js
const parent = document.getElementById('list');
const fragment = document.createDocumentFragment();
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item;
  fragment.appendChild(li); // reflow発生しません
}
parent.appendChild(fragment); // ここで1回だけreflow
```

#### 適用例
- `tweetWidgetDataViewer.ts`（DataView相当）
- `recent-notes/index.ts`（全件描画時）
- `tweetWidgetUI.ts`（スレッドリスト描画）
- `calendar/index.ts` など

#### 注意点・アンチパターン
- fragmentにappendしたノードは、fragment自体をappendChildした時点で「親DOM」に移動されます（コピーではありません）のでご注意ください。
- fragmentを複数回appendChildしても2回目以降は空になります（使い捨てです）。
- fragment内でイベントリスナーを付与した場合、親DOMに追加後も有効です。

#### パフォーマンス計測例
- Chrome DevToolsのPerformanceタブで「Scripting」「Rendering」コストを比較します。
- ループ内appendChildとDocumentFragment利用時で、Timeline上のreflow回数・時間を計測します。

#### 参考リンク
- [MDN: DocumentFragment](https://developer.mozilla.org/ja/docs/Web/API/DocumentFragment)
- [Google Developers: Efficiently rendering large lists](https://web.dev/dom-optimization/)

---

### 2. Markdownレンダリングのバッチ化・キャッシュ

#### 背景・理論
Obsidianの`MarkdownRenderer.render`は、内部でパース・HTML生成・DOM挿入・プラグインフックなど多くの処理を行うため、1回ごとのコストが高く、ループや大量描画時にパフォーマンス低下の主因となります。また、同一内容のMarkdownを複数回描画する場合、毎回パース・描画するのは非効率です。

#### 実装例

**NG例：ループ内で毎回renderです**
```js
for (const md of markdownList) {
  const el = document.createElement('div');
  await MarkdownRenderer.render(app, md, el, '/', plugin);
  parent.appendChild(el);
}
```

**OK例1：バッチ化（オフスクリーンでまとめて描画→DocumentFragmentで一括追加）です**
```js
const fragment = document.createDocumentFragment();
for (const md of markdownList) {
  const el = document.createElement('div');
  await MarkdownRenderer.render(app, md, el, '/', plugin);
  fragment.appendChild(el);
}
parent.appendChild(fragment);
```

**OK例2：キャッシュ活用（同一Markdownは複製で高速描画）です**
```js
const cache = new Map();
for (const md of markdownList) {
  let el;
  if (cache.has(md)) {
    el = cache.get(md).cloneNode(true);
  } else {
    el = document.createElement('div');
    await MarkdownRenderer.render(app, md, el, '/', plugin);
    cache.set(md, el.cloneNode(true));
  }
  parent.appendChild(el);
}
```

#### 適用例
- 全ウィジェットのMarkdown描画箇所

#### 注意点・アンチパターン
- キャッシュは「Markdown文字列」単位で管理し、動的要素（チェックボックス等）がある場合は注意。
- 複製（cloneNode）時、イベントリスナーや一部の内部状態は引き継がれない場合があります。
- キャッシュのメモリ消費に注意し、必要に応じて上限やLRU方式を検討しましょう。

#### パフォーマンス計測例
- DevToolsのPerformanceタブで「Scripting」コストを比較します。
- 100件以上のMarkdown描画時、キャッシュ有無で描画時間を計測します。

#### 参考リンク
- [Obsidian API: MarkdownRenderer](https://publish.obsidian.md/api/MarkdownRenderer)
- [MDN: cloneNode](https://developer.mozilla.org/ja/docs/Web/API/Node/cloneNode)

---

### 3. textarea等の自動リサイズreflow最適化

#### 背景・理論
textareaの自動リサイズは、`scrollHeight`取得（read）と`style.height`変更（write）を頻繁に行うと、都度reflowが発生し、特に複数要素で同時に発生するとパフォーマンスが大きく低下します。`requestAnimationFrame`でバッチ化し、1フレーム内でまとめて処理することでreflow回数を削減できます。

#### 実装例

**NG例：inputイベントごとに即時リサイズです**
```js
textarea.addEventListener('input', () => {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
});
```

**OK例：requestAnimationFrameでバッチ化です**
```js
let resizeQueued = false;
textarea.addEventListener('input', () => {
  if (!resizeQueued) {
    resizeQueued = true;
    requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      resizeQueued = false;
    });
  }
});
```

**複数要素対応（グローバルバッチresize）です**
```js
const resizeTargets = new Set();
function queueResize(textarea) {
  resizeTargets.add(textarea);
  if (resizeTargets.size === 1) {
    requestAnimationFrame(() => {
      for (const ta of resizeTargets) {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      }
      resizeTargets.clear();
    });
  }
}
```

#### 適用例
- `memo/index.ts`
- `tweetWidgetUI.ts`

#### 注意点・アンチパターン
- inputイベントごとに即時reflowを発生させない。
- 高頻度なresizeが必要な場合はthrottleやdebounceの利用も検討する。

#### パフォーマンス計測例
- DevToolsのPerformanceタブで「Recalculate Style」「Layout」イベントの回数を比較する。
- textareaを連打した際のフレーム落ち有無を確認する。

#### 参考リンク
- [MDN: requestAnimationFrame](https://developer.mozilla.org/ja/docs/Web/API/window/requestAnimationFrame)

---

### 4. 仮想リスト（Virtual List）による大規模リスト最適化

#### 背景・理論
大量のリスト（例：100件以上）を全てDOM化すると、reflowやメモリ消費が大きくなり、描画・スクロール性能が著しく低下します。仮想リスト（Virtual List）は「表示範囲＋バッファ分」だけDOMを生成し、スクロール時に再利用・差分更新することで、常に最小限のDOMツリーを維持します。

#### 実装例

**NG例：全件をそのままDOM化です**
```js
for (const item of items) {
  const li = document.createElement('li');
  li.textContent = item;
  parent.appendChild(li);
}
```

**OK例：仮想リスト（可視範囲＋α件のみDOM化）です**
```js
// 可視範囲のインデックスを計算し、その範囲だけDOMを生成
const visibleStart = ...; // スクロール位置から算出
const visibleEnd = ...;
for (let i = visibleStart; i < visibleEnd; i++) {
  const li = document.createElement('li');
  li.textContent = items[i];
  parent.appendChild(li);
}
// スクロール時は再利用・差分更新
```

#### 適用例
- `recent-notes/index.ts`

#### 注意点・アンチパターン
- スクロール時に「全DOMを作り直す」のではなく、既存ノードの再利用・差分更新を徹底する。
- 高さ可変リストの場合は、各アイテムの高さ計測・キャッシュが必要。
- スクロールジャンプ時のちらつきや遅延描画に注意。

#### パフォーマンス計測例
- DevToolsでリスト描画時の「Elements」ツリーのノード数を比較する。
- スクロール時の「Scripting」「Rendering」コストを計測する。

#### 参考リンク
- [MDN: Virtual Scrolling](https://developer.mozilla.org/ja/docs/Web/Performance/Virtual_scrolling)
- [react-window（仮想リスト実装ライブラリ）](https://github.com/bvaughn/react-window)

---

### 5. resize/ドラッグ時のreflow最適化

#### 背景・理論
パネルやウィジェットのリサイズ・ドラッグ時、mousemoveごとにstyle.widthやstyle.heightを即時変更すると、1ピクセルごとにreflowが発生し、動作が重くなります。`requestAnimationFrame`でバッチ化し、1フレーム1回だけDOM変更することで、滑らかな操作感とreflow削減を両立します。

#### 実装例

**NG例：mousemoveごとに即時style変更です**
```js
element.addEventListener('mousemove', (e) => {
  element.style.width = e.clientX + 'px'; // 毎回reflow
});
```

**OK例：requestAnimationFrameでバッチ化です**
```js
let resizeQueued = false;
let latestX = 0;
element.addEventListener('mousemove', (e) => {
  latestX = e.clientX;
  if (!resizeQueued) {
    resizeQueued = true;
    requestAnimationFrame(() => {
      element.style.width = latestX + 'px';
      resizeQueued = false;
    });
  }
});
```

#### 適用例
- `modal.ts`

#### 注意点・アンチパターン
- mousemoveイベントのたびにDOM変更しない。
- resize終了時に最終値を確実に反映する。
- 連続resize中の他UIへのreflow波及に注意。

#### パフォーマンス計測例
- DevToolsでリサイズ時の「Layout」イベント回数を比較する。
- 連続ドラッグ時のフレーム落ち有無を確認する。

#### 参考リンク
- [MDN: requestAnimationFrame](https://developer.mozilla.org/ja/docs/Web/API/window/requestAnimationFrame)

---

### 6. CSS Containmentの活用

#### 背景・理論
大規模リストやDataViewなどの再描画・reflowが、他のDOM要素に波及するのを防ぐため、CSSの`contain`プロパティを活用します。`contain: layout style paint;`を親要素に付与することで、レイアウト・スタイル・ペイントの影響範囲を限定し、パフォーマンスを向上させます。

#### 実装例

**OK例：主要リスト・ウィジェット親要素にcontainを付与です**
```css
.widget-content,
.tweet-data-viewer-table,
.recent-notes-list {
  contain: layout style paint;
}
```

#### 適用例
- `styles.css`にて主要リスト・ウィジェット親要素へ適用済み。

#### 注意点・アンチパターン
- containを付与すると、外部CSSや親要素のスタイル継承が制限される場合があります。
- レイアウトやスタイルの依存関係が強い場合は適用範囲に注意。

#### パフォーマンス計測例
- DevToolsの「Performance」タブで、contain有無によるreflow波及範囲を比較します。
- 大規模リスト描画時の他要素への影響を観察します。

#### 参考リンク
- [MDN: contain - CSS: カスケーディングスタイルシート | MDN](https://developer.mozilla.org/ja/docs/Web/CSS/contain)
- [CSS Containment Module Level 3](https://drafts.csswg.org/css-contain-3/)

---

### 7. read→write分離（レイアウト値取得とDOM変更の分離）

#### 背景・理論
ループ内で「レイアウト値取得（例：getBoundingClientRect, scrollHeight）」と「style変更（DOM書き換え）」が混在すると、都度reflowが発生しパフォーマンスが大きく低下します。read→write分離（Layout Thrashing防止）は、まず全要素のレイアウト値を一括取得し、その後まとめてDOM変更することで、reflow回数を最小限に抑える手法です。

#### 実装例

**NG例：ループ内でread→writeが交互に発生です**
```js
for (const el of elements) {
  const rect = el.getBoundingClientRect(); // read
  el.style.width = rect.width + 10 + 'px'; // write
}
```

**OK例：read→write分離です**
```js
const widths = [];
for (const el of elements) {
  widths.push(el.getBoundingClientRect().width); // readのみ
}
for (let i = 0; i < elements.length; i++) {
  elements[i].style.width = (widths[i] + 10) + 'px'; // writeのみ
}
```

#### 適用例
- 全ウィジェット（現状混在なし、今後も設計時に徹底）

#### 注意点・アンチパターン
- ループ内でread→writeが交互に発生しないよう、必ず分離する。
- 大規模リストや複雑なUI追加時は特に注意。

#### パフォーマンス計測例
- DevToolsで「Forced reflow」警告の有無を確認する。
- read→write分離有無でreflow回数・描画時間を比較する。

#### 参考リンク
- [Google Developers: Avoiding layout thrashing](https://web.dev/avoid-large-complex-layouts-and-layout-thrashing/)
- [MDN: Layout thrashing](https://developer.mozilla.org/ja/docs/Glossary/Layout_thrashing)

---

### 8. その他の設計・実装ルール

#### 背景・理論
DOM操作やUI設計全般において、パフォーマンス劣化を防ぐための基本的なルールを徹底します。特にループ内DOM操作の最小化、バッチ化、差分更新、containmentや仮想リストの活用が重要です。

#### 実装例・設計ルール
- ループ内でのDOM操作は最小限にし、可能な限りバッチ化・差分更新を徹底する。
- 新規ウィジェットや大規模リスト追加時は、containment・仮想リスト・バッチ化の適用を必ず検討する。
- パフォーマンス計測（Chrome DevToolsのPerformanceタブ等）でreflowコストを定期的に確認する。
- **YAMLでの大きさ指定（width/height）もバッチ化・差分更新の対象**
  各ウィジェットの`create`で`settings.width`/`settings.height`を直接styleに反映する場合も、
  ループ内でのDOM操作やreflow波及に注意し、必要に応じてDocumentFragmentやcontain等を併用してください。

#### 注意点
- 既存ルールを逸脱する場合は必ず理由とパフォーマンス検証を行う。
- 差分更新（DOM diff）を意識し、全再描画を避ける。

#### パフォーマンス計測例
- 定期的にDevToolsでreflow・paintコストを確認する。
- 大規模UI追加時は必ず事前・事後で計測する。

#### 参考リンク
- [Google Developers: DOM performance](https://web.dev/dom-optimization/)

---

### 9. Chart.js等の外部ライブラリ利用時のreflow対策

#### 背景・理論
Chart.jsなどの外部グラフライブラリは、内部で大量のDOM操作やレイアウト計算を行うことがあり、reflowコストが高くなりがちです。containプロパティやライブラリのオプション設定で、不要な再描画・reflowを抑制します。

#### 実装例

**OK例：containとオプションの活用です**
```css
.chart-container {
  contain: layout style;
}
```
```js
const chart = new Chart(ctx, {
  type: 'bar',
  data: ...,
  options: {
    responsive: false,
    animation: false,
    // ...
  }
});
```

#### 適用例
- `reflectionWidgetUI.ts`（2024/06最適化）
- `reflectionWidgetUI.ts`（2025/06 キャッシュ読み込みと投稿データ取得の並列化）

#### 注意点・アンチパターン
- responsive: trueやanimation: trueはreflow・再描画コスト増大の原因となります。
- グラフサイズ変更時は明示的に再描画を制御します。

#### パフォーマンス計測例
- DevToolsでグラフ描画時の「Scripting」「Rendering」コストを比較します。
- オプション有無で描画時間・reflow回数を計測します。

#### 参考リンク
- [Chart.js: Performance](https://www.chartjs.org/docs/latest/general/performance.html)
- [MDN: contain](https://developer.mozilla.org/ja/docs/Web/CSS/contain)

---

### 10. グローバルバッチresize方式の活用

#### 背景・理論
複数のtextareaやinputで同時に自動リサイズが発生すると、個別にreflowが多発し、全体のパフォーマンスが大きく低下します。グローバルバッチresizeは、`requestAnimationFrame`で全要素の高さを一括read→writeすることで、reflow回数を最小限に抑えます。クラスstaticメソッド等で管理し、全ウィジェットで共通化することで、全体最適化が可能です。

#### 実装例

**OK例：グローバルバッチresize関数**
```js
class GlobalResizer {
  static targets = new Set();
  static queued = false;

  static queueResize(textarea) {
    GlobalResizer.targets.add(textarea);
    if (!GlobalResizer.queued) {
      GlobalResizer.queued = true;
      requestAnimationFrame(() => {
        for (const ta of GlobalResizer.targets) {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        }
        GlobalResizer.targets.clear();
        GlobalResizer.queued = false;
      });
    }
  }
}
// 各textareaのinputイベントでGlobalResizer.queueResizeを呼ぶ
```

#### 適用例
- `memo/index.ts`、`tweetWidgetUI.ts`（2024/06最適化）

#### 注意点・アンチパターン
- 個別resizeとグローバルバッチresizeが混在しないよう統一する。
- 高頻度resize時はバッチ処理の遅延に注意。

#### パフォーマンス計測例
- DevToolsで複数textarea同時入力時のreflow回数を比較。
- グローバルバッチresize有無でフレーム落ちの有無を確認。

#### 参考リンク
- [MDN: requestAnimationFrame](https://developer.mozilla.org/ja/docs/Web/API/window/requestAnimationFrame)

---

### 11. 外部CSS・テーマとの干渉対策

#### 背景・理論
ユーザーのカスタムCSSやサードパーティテーマが、ウィジェットのreflowコストや描画性能に悪影響を及ぼす場合があります。containmentや`will-change`、`isolation`等のCSSプロパティで、外部スタイルの波及を遮断し、安定したパフォーマンスを確保します。

#### 実装例

**OK例：contain, will-change, isolationの活用**
```css
.widget-content {
  contain: layout style paint;
  will-change: transform;
  isolation: isolate;
}
```

#### 適用例
- 主要ウィジェットの親要素（`styles.css`）

#### 注意点・アンチパターン
- isolationやwill-changeは乱用すると逆にパフォーマンス低下やバグの原因となるため、必要な範囲に限定する。
- containを付与した要素の外部スタイル継承制限に注意。

#### パフォーマンス計測例
- DevToolsで外部テーマ適用時のreflow・paintコストを比較。
- containment有無で他要素への影響を観察。

#### 参考リンク
- [MDN: will-change](https://developer.mozilla.org/ja/docs/Web/CSS/will-change)
- [MDN: isolation](https://developer.mozilla.org/ja/docs/Web/CSS/isolation)

---

### 12. パフォーマンス計測・自動テストの推奨

#### 背景・理論
コード変更時や新機能追加時に、reflowコストや描画性能が劣化していないかを継続的に監視することが重要です。Chrome DevToolsやLighthouseによる手動・自動計測、主要ウィジェットの描画・リサイズ時のreflow回数・時間を自動テストで検証する仕組みを推奨します。

#### 実装例
- CIや開発時にChrome DevToolsのPerformanceタブやLighthouseで定期的に計測。
- Puppeteer等を用いた自動UIテストで、描画・リサイズ時のreflow回数・描画時間を検証。

#### 注意点
- 手動計測だけでなく、CI等での自動計測・アラート仕組みも検討する。
- パフォーマンス指標（reflow回数、描画時間等）を定量的に記録・比較する。

#### パフォーマンス計測例
- DevToolsのPerformanceタブで「Scripting」「Rendering」「Layout」イベントを記録。
- Lighthouseでパフォーマンススコアを定期取得。

#### 参考リンク
- [Google Developers: Lighthouse](https://web.dev/performance-scoring/)
- [Puppeteer: Headless Chrome Node API](https://pptr.dev/)

---

### 13. 2024年6月パフォーマンス最適化実施内容

#### 1. MarkdownレンダリングのLRUキャッシュ導入
- `renderMarkdownBatchWithCache`でMarkdown→HTML変換結果（DocumentFragment）をLRU方式でキャッシュ。
 - キャッシュ上限は100件とし、古いものから自動削除。
- すべてのウィジェット（TweetWidget, MemoWidget, ReflectionWidget, FileViewWidget等）で共通のキャッシュを利用。

#### 2. プリウォーム（事前キャッシュ生成）の実装
- プラグイン起動時（onload）に、全ウィジェットのMarkdownデータをバックグラウンドで順次キャッシュ。
- TweetWidgetの全投稿、MemoWidgetの内容、FileViewWidgetのファイル内容、ReflectionWidgetのAI要約（今日・今週）を対象。
- バッチサイズを小さくし（例：2件→1件）、`setTimeout`や`requestIdleCallback`で分割実行し、UIブロックを防止。
- プリウォーム開始・完了時にObsidianのNoticeでユーザーに通知。

#### 3. MemoWidgetの最適化
- 初回表示時にキャッシュがなければ自動生成（プリウォームでカバーしきれない場合も2回目以降は高速化）。
- `updateMemoEditUI`は差分更新を徹底し、重いループや全件再描画を避ける設計。
- メモ内容が長文やmermaidグラフを含む場合でも、できるだけパフォーマンス劣化を抑制。
- MermaidグラフはWorkerでSVG化し、コード文字列をキーとしたメモリキャッシュを共有。

#### 4. ReflectionWidget（振り返りレポート）のAI要約キャッシュ
- `data.json`に保存されているAI要約（今日・今週）もプリウォーム時にキャッシュ。
- 初回表示時のAI要約描画も高速化。

#### 5. バッチ処理の粒度調整・分割描画
- プリウォームや大量描画処理のバッチサイズを小さくし、1フレームでの処理量を抑制。
- 必要に応じて`requestIdleCallback`も活用し、UIのカクつきを防止。

#### 6. パフォーマンス警告（[Violation]）への対応
- requestAnimationFrameやバッチ処理の粒度を調整し、1フレームで重い処理が走らないように最適化。
- 特にmermaidグラフなど重いMarkdown要素がある場合は、警告が出るのは仕様上やむを得ないことも明示。

#### 7. 今後の拡張ポイント
- LRUキャッシュの「容量（バイト数）」ベース管理への拡張も可能（現状は件数ベース）。
- MemoWidgetで外部ファイルやデータ参照が増えた場合も、プリウォームで対応できるよう設計。
- 必要に応じてウィジェットごとの個別キャッシュや、仮想リスト・差分描画のさらなる導入も検討可能。

### 14. ブラウザレンダリングパイプラインの理論的背景

#### 背景・理論
ブラウザはDOMツリーとCSSOMを構築した後、レンダーツリーを生成し、これをもとにレイアウト計算とペイントを行います。レイアウト（reflow）はツリー全体への波及コストを伴うため、DOM更新のタイミングや回数を制御することが極めて重要です。DocumentFragmentやVirtual Listは、このレイアウトパスの発生を遅延・最小化する典型的手法と位置付けられます。また、`contain`プロパティはサブツリーのレイアウト境界を明示的に切り分け、パイプラインの影響範囲を限定します。

#### 実装例
- Virtual DOMや差分アルゴリズムを自前で実装する場合でも、最終的なDOM挿入はDocumentFragmentを介して一括で行う。
- 高頻度でサイズが変化する要素には`contain: layout style`を付与し、再帰的なレイアウト波及を防ぐ。

#### 参考文献
- [Blink Rendering Architecture](https://www.chromium.org/developers/design-documents/blink-rendering/)
- [CSS Containment Module Level 3](https://drafts.csswg.org/css-contain-3/)
### 15. JavaScriptイベントループとマイクロタスク最適化

#### 背景・理論
ブラウザのイベントループは、タスクキューとマイクロタスクキューによって処理順序が決定されます。大量のDOM操作やPromiseチェーンを組み合わせる際、マイクロタスクが溜まり過ぎるとフレームレートが低下することがあります。`requestAnimationFrame`を用いたバッチ処理は、イベントループのタスクフェーズで実行されるため、マイクロタスクによるブロッキングを回避できます。

#### 実装例
- 複雑な非同期処理の合間に`await`を多用する場合でも、UI更新は`requestAnimationFrame`でまとめ、マイクロタスクの連鎖を防ぐ。
- マイクロタスクが大量発生するケースでは`queueMicrotask`の使用を最小限に留め、必要に応じて`setTimeout`や`requestIdleCallback`で分散させる。

#### 参考文献
- [WHATWG HTML Standard: 8.1 The event loop](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [Jake Archibald: In The Loop](https://developers.google.com/web/updates/2018/09/inside-browser-part2)
---

本資料は、今後の開発・リファクタ・レビュー時の指針としてご活用ください。 
