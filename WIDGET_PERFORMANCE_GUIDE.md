# Obsidianウィジェットボードプラグイン
## パフォーマンス最適化設計指針・実施履歴

---

## 1. DocumentFragmentによるDOMバッチ追加

- **背景**  
  ループ内で`appendChild`や`importNode`を直接使うと、都度reflow・再描画が発生しパフォーマンスが低下する。
- **方針**  
  ループ内では`DocumentFragment`にノードを追加し、最後に一度だけ親要素へ`appendChild`することでreflowを1回に抑制。
- **適用例**  
  - `tweetWidgetDataViewer.ts`（DataView相当）
  - `recentNotesWidget.ts`（全件描画時）
  - `tweetWidgetUI.ts`（スレッドリスト描画）
  - `calendarWidget.ts` など

---

## 2. Markdownレンダリングのバッチ化・キャッシュ

- **背景**  
  Obsidianの`MarkdownRenderer.render`は重い処理が多く、複数回呼ぶとパフォーマンスが低下。
- **方針**  
  - `renderMarkdownBatch`ユーティリティでオフスクリーンレンダリング→DocumentFragmentで一括追加。
  - `renderMarkdownBatchWithCache`で同一Markdownはキャッシュから即座に複製し、2回目以降の描画コストをほぼゼロに。
- **適用例**  
  - 全ウィジェットのMarkdown描画箇所

---

## 3. textarea等の自動リサイズreflow最適化

- **背景**  
  `scrollHeight`取得と`style.height`変更を頻繁に行うとreflowが多発。
- **方針**  
  - `requestAnimationFrame`でバッチ化し、1フレーム内で1回だけ高さを調整。
  - 必要に応じてthrottleやキャッシュも活用。
- **適用例**  
  - `memoWidget.ts`
  - `tweetWidgetUI.ts`

---

## 4. 仮想リスト（Virtual List）による大規模リスト最適化

- **背景**  
  100件以上のリストを全てDOM化するとreflow・メモリ消費が大きい。
- **方針**  
  - 表示範囲＋α件のみDOM生成し、スクロール時に再利用・差分更新。
- **適用例**  
  - `recentNotesWidget.ts`

---

## 5. resize/ドラッグ時のreflow最適化

- **背景**  
  パネルリサイズ時、mousemoveごとにstyle.widthを書き換えるとreflowが多発。
- **方針**  
  - `requestAnimationFrame`でバッチ化し、1フレーム1回だけstyle変更。
- **適用例**  
  - `modal.ts`

---

## 6. CSS Containmentの活用

- **背景**  
  大規模リストやDataViewのreflowが他要素に波及するのを防ぐ。
- **方針**  
  - `.widget-content`, `.tweet-data-viewer-table`, `.recent-notes-list`等の親要素に`contain: layout style paint;`を付与。
- **適用例**  
  - `styles.css`にて主要リスト・ウィジェット親要素へ適用済み。

---

## 7. read→write分離（レイアウト値取得とDOM変更の分離）

- **背景**  
  ループ内で「レイアウト値取得（getBoundingClientRect等）」と「style変更」が混在するとreflowが多発。
- **方針**  
  - ループ内でレイアウト値を一括取得→その後まとめてstyle変更（read→write分離）。
  - 現状の全ウィジェットでは混在なし。今後も設計時に徹底する。
- **設計ルール**  
  - 大規模リストや複雑なUI追加時は、read→write分離を必ず意識する。

---

## 8. その他の設計・実装ルール

- ループ内でのDOM操作は最小限にし、可能な限りバッチ化・差分更新を徹底する。
- 新規ウィジェットや大規模リスト追加時は、containment・仮想リスト・バッチ化の適用を必ず検討する。
- パフォーマンス計測（Chrome DevToolsのPerformanceタブ等）でreflowコストを定期的に確認する。

---

## 参考：今後の拡張時のチェックリスト

- [ ] ループ内でのappendChildやstyle変更が多発していないか？
- [ ] レイアウト値取得とstyle変更が混在していないか？
- [ ] 大規模リストは仮想リスト化・バッチ化されているか？
- [ ] Markdown描画はキャッシュ・バッチ化されているか？
- [ ] 親要素にcontain: layout style paint;が付与されているか？

---

## 9. Chart.js等の外部ライブラリ利用時のreflow対策

- **背景**  
  Chart.jsなどの外部グラフライブラリは、内部で大量のDOM操作やレイアウト計算を行うことがある。
- **方針**  
  - グラフコンテナに`contain: layout style;`を付与し、再レイアウトの波及範囲を限定する。
  - Chart.jsの`responsive: false`や`animation: false`等のオプションを活用し、不要な再描画・reflowを抑制する。
- **適用例**  
  - `reflectionWidgetUI.ts`（2024/06最適化）

---

## 10. グローバルバッチresize方式の活用

- **背景**  
  複数のtextareaやinputで同時に自動リサイズが発生すると、個別にreflowが多発する。
- **方針**  
  - `requestAnimationFrame`で全要素の高さを一括read→writeするグローバルバッチresize関数を導入。
  - クラスstaticメソッド等で管理し、全ウィジェットで共通化。
- **適用例**  
  - `memoWidget.ts`、`tweetWidgetUI.ts`（2024/06最適化）

---

## 11. 外部CSS・テーマとの干渉対策

- **背景**  
  ユーザーのカスタムCSSやサードパーティテーマがreflowコストを増大させる場合がある。
- **方針**  
  - 主要ウィジェットの親要素に`contain: layout style paint;`を必ず付与し、外部スタイルの波及を遮断。
  - 必要に応じて`will-change`や`isolation`も検討。

---

## 12. パフォーマンス計測・自動テストの推奨

- **背景**  
  コード変更時にreflowコストが増大していないかを継続的に監視する必要がある。
- **方針**  
  - CIや開発時にChrome DevToolsのPerformanceタブやLighthouseで定期的に計測。
  - 主要ウィジェットの描画・リサイズ時のreflow回数・時間を自動テストで検証する仕組みを検討。

---

本資料は、今後の開発・リファクタ・レビュー時の指針としてご活用ください。 