# Obsidian Widget Board Plugin  
## ウィジェット開発マニュアル

このドキュメントは自動生成されました。


---

## 目次

1. 概要
2. ウィジェット開発フロー
3. ウィジェット仕様一覧
4. スタイルガイド
5. ウィジェットID・設定管理の仕組み
    - 5.1 ウィジェットIDとは
    - 5.2 グローバル設定とは
    - 5.3 MapによるIDごとのインスタンス・状態管理
6. よくある質問
7. 参考
8. よく使う関数・メソッド一覧
9. ウィジェット開発の最小要件
10. 主要設定・管理ファイルの説明
11. パフォーマンス最適化・設計ベストプラクティス
12. 実践ガイド・FAQ・トラブルシューティング

---

## 1. 概要

このドキュメントは、Obsidian Widget Board Plugin用のウィジェットを新規開発・カスタマイズするためのガイドです。  
ウィジェットの構造、開発手順、スタイルルール、既存仕様などをまとめています。

---

## 2. ウィジェット開発フロー

1. **ウィジェットの設計**
    - どんな機能・UIを持つウィジェットかを決める
    - 必要な設定項目やデータ構造を設計
2. **ファイル作成**
    - `src/widgets/` ディレクトリに新しいウィジェット用ファイルを作成（例: `src/widgets/MyWidget.ts`）
3. **ウィジェットクラスの実装**
    - 「Widget」ベースのクラスを作成し、`render()` メソッドでDOMを生成
    - 設定値や状態管理が必要な場合は、クラス内で管理
4. **スタイルの追加**
    - `styles.css` にウィジェット固有のクラス名でスタイルを追加（例: `.my-widget { ... }`）
    - 既存の共通クラス（例: `.widget`, `.widget-content` など）も活用
5. **ウィジェットの登録**
    - メインプラグインファイルで新ウィジェットを登録
    - ウィジェット一覧や追加ボタンに反映
6. **動作確認・デバッグ**
    - Obsidian上でウィジェットを追加し、動作・UIを確認
    - 必要に応じて修正
7. **ドキュメント・コメント整備**
    - コード内にJSDocやコメントを記載
    - 使い方や注意点をまとめる

---

## 3. ウィジェット仕様一覧

- ルート要素: `.widget`
- 内容エリア: `.widget-content`
- タイトル: `<h4>`
- 背景画像対応: `.has-background-image`
- エラー表示: `.widget-error`, `.widget-unknown`

### 主な既存ウィジェット例

| 名前                | 主なクラス名                | 機能概要                      |
|---------------------|-----------------------------|-------------------------------|
| Pomodoro Timer      | `.pomodoro-timer-widget`    | ポモドーロタイマー            |
| Memo                | `.memo-widget`              | メモウィジェット              |
| Calendar            | `.calendar-widget`          | カレンダー表示                |
| YouTube             | `.youtube-widget`           | YouTube埋め込み               |
| Recent Notes        | `.recent-notes-widget`      | 最近編集したノート一覧        |
| Theme Switcher      | `.theme-switcher-widget`    | テーマ切り替え                |

### パネル表示モード

- 右1/3: `.mode-right-third`
- 右1/2: `.mode-right-half`
- 左2/3: `.mode-left-two-third`
- 左1/2: `.mode-left-half`
- 中央1/2: `.mode-center-half`
- 左1/3: `.mode-left-third`
- 右2/3: `.mode-right-two-third`
- 中央1/3: `.mode-center-third`
- カスタム幅: `.custom-width-right`, `.custom-width-left`, `.custom-width-center`

### その他の仕様

- ウィジェットはドラッグ＆ドロップで並び替え可能
- 編集モード時は削除ボタン（`.wb-widget-delete-btn`）が表示
- 各ウィジェットは設定パネル（`.wb-settings-panel`）を持つことができる

---

## 4. スタイルガイド

- 共通クラス `.widget`, `.widget-content` をベースに拡張
- 角丸・シャドウ・余白などは既存スタイルに合わせる
- レスポンシブ対応（@mediaで幅調整）
- ボタンや入力欄は共通クラスを利用
- カスタムクラスは `-widget` や `-container` など命名規則を統一

#### 例: 新規ウィジェット用CSS

```css
.my-widget {
  /* widget共通スタイルを継承しつつ、独自の装飾を追加 */
  background: var(--background-secondary);
  border-radius: 10px;
  padding: 16px;
}
.my-widget .widget-content {
  /* 内容エリアのカスタマイズ */
}
```

---

## 5. ウィジェットID・設定管理の仕組み

### 5.1 ウィジェットIDとは

- **ウィジェットID**は、各ウィジェットインスタンスを一意に識別するための文字列です。
- 通常、ウィジェットを追加した際に自動生成されます（例: `widget-123456`）。
- 設定や状態の保存・復元、ウィジェットの並び替え、削除などの操作時にIDが使われます。
- **注意:**
    - 同じ種類のウィジェットでも、インスタンスごとに異なるIDが割り当てられます。
    - IDは手動で変更しないでください（内部的な整合性が崩れる可能性があります）。

### 5.2 グローバル設定とは

- **グローバル設定**とは、全ウィジェットや全ユーザーに共通する設定値のことです。
    - 例: パネルの表示モード、テーマ、共通ショートカットなど
- グローバル設定は、通常プラグインのメイン設定や`data.json`などで管理されます。

#### コード例（ID・グローバル設定の利用）

```js
// ウィジェットの状態保存
saveWidgetState(widgetId, state) {
  this.data.widgets[widgetId] = state;
  this.saveData();
}

// グローバル設定の保存
saveGlobalSetting(key, value) {
  this.data.global[key] = value;
  this.saveData();
}
```

### 5.3 MapによるIDごとのインスタンス・状態管理

- 複数の同種ウィジェット（例：ポモドーロタイマー）を同時に扱う場合、それぞれのウィジェットの状態やインスタンスを区別して管理する必要があります。
- そのため、ウィジェットID（string）をキーとして、インスタンスや状態をMapで管理します。

#### インスタンス管理

```ts
private static widgetInstances: Map<string, PomodoroWidget> = new Map();
```
- 「ウィジェットID → PomodoroWidgetインスタンス」の対応表です。
- 例：`widget-abc123`というIDのウィジェットがあれば、
  `PomodoroWidget.widgetInstances.get('widget-abc123')` でそのインスタンスを取得できます。

#### 状態管理

```ts
private static widgetStates: Map<string, any> = new Map();
```
- 「ウィジェットID → 状態オブジェクト（タイマーの残り時間や進行状況など）」の対応表です。
- 例：`widget-abc123`の状態を取得・更新したい場合は
  `PomodoroWidget.widgetStates.get('widget-abc123')`
  `PomodoroWidget.widgetStates.set('widget-abc123', 新しい状態)`
  のように操作します。

#### 使い方の流れ

1. **ウィジェット生成時**
    - 新しいウィジェットが作られるとき、`widgetInstances`にインスタンスを登録します。
    - 例：`widgetInstances.set(config.id, this);`
2. **状態の更新**
    - タイマーの開始・一時停止・リセットなどの操作時に、`widgetStates`の該当IDの値を更新します。
    - 例：`widgetStates.set(this.config.id, { ...新しい状態 });`
3. **状態の参照・同期**
    - 画面の再描画や他の処理で、`widgetStates`から現在の状態を取得し、インスタンスのプロパティに反映します。
4. **ウィジェット削除時**
    - ウィジェットが削除されたら、`widgetInstances`や`widgetStates`から該当IDのエントリを削除します。

#### メリット

- IDで一意に管理できるため、同じ種類のウィジェットが複数あっても混乱しない。
- 状態の保存・復元が簡単（Mapに入れるだけ）。
- 全ウィジェットの一括処理や、特定IDだけの処理が容易。

#### コード例（抜粋）

```ts
// インスタンス登録
PomodoroWidget.widgetInstances.set(config.id, this);

// 状態の保存
PomodoroWidget.widgetStates.set(this.config.id, {
  isRunning: this.isRunning,
  remainingTime: this.remainingTime,
  // ...他の状態
});

// 状態の取得
const state = PomodoroWidget.widgetStates.get(this.config.id);
if (state) {
  this.isRunning = state.isRunning;
  this.remainingTime = state.remainingTime;
  // ...他の状態を同期
}
```

#### 注意点

- Mapはメモリ上の一時的な管理なので、永続化（保存）は別途必要です（通常は`plugin.saveSettings()`などで`data.json`に保存）。
- ウィジェットのIDは一意であることが前提です。

---

## 6. よくある質問

**Q. ウィジェットの設定項目はどこで管理する？**  
A. 各ウィジェットクラス内で管理し、設定パネル（`.wb-settings-panel`）でUIを提供します。

**Q. ウィジェットの状態はどこで保存される？**  
A. プラグインのデータストア（例: `data.json`）やObsidianのストレージに保存されます。

**Q. 既存ウィジェットのスタイルを流用したい**  
A. `.widget`, `.widget-content` などの共通クラスを利用し、必要に応じて独自クラスを追加してください。

---

## 7. 参考

- 既存の `src/widgets/` ディレクトリ内のウィジェット実装
- `styles.css` のウィジェット関連スタイル
- Obsidian公式ドキュメント

---

## 8. よく使う関数・メソッド一覧

### 1. UI生成・DOM操作

- `createEl(tag, options)` ・・・要素を生成（例: `div`, `button`, `h4` など）
- `createDiv(options)` ・・・`div`要素を生成
- `setValue(value)` ・・・入力欄やドロップダウンの値をセット
- `onChange(callback)` ・・・入力欄やドロップダウンの値変更時のイベント登録
- `addEventListener(event, handler)` ・・・任意のDOMイベントを登録
- `setName(name)` ・・・設定UIのラベル名をセット
- `setDesc(description)` ・・・設定UIの説明文をセット
- `addText(callback)` ・・・テキスト入力欄を追加
- `addTextArea(callback)` ・・・複数行テキスト入力欄を追加
- `addDropdown(callback)` ・・・ドロップダウンを追加
- `addButton(callback)` ・・・ボタンを追加

### 2. 設定・状態管理

- `saveSettings(boardId?)` ・・・設定を保存（`data.json`などに永続化）
- `updateExternalSettings(newSettings, widgetId?)` ・・・外部からウィジェットの設定を更新
- `widgetInstances.set(id, instance)` ・・・IDごとにウィジェットインスタンスを登録
- `widgetStates.set(id, state)` ・・・IDごとにウィジェットの状態を保存
- `widgetInstances.get(id)` ・・・インスタンス取得
- `widgetStates.get(id)` ・・・状態取得
- `removePersistentInstance(widgetId, plugin)` ・・・インスタンスの静的マップから削除
- `cleanupAllPersistentInstances(plugin)` ・・・すべてのインスタンスを静的マップから削除

### 3. イベント・UI更新

- `updateDisplay()` ・・・ウィジェットのUIを再描画
- `updateMemoEditUI()` ・・・メモウィジェットの編集UIを更新
- `handleShow()` ・・・モーダル表示時の処理

### 4. その他

- `setIcon(element, iconName)` ・・・ボタン等にアイコンをセット
- `Notice(message, timeout)` ・・・Obsidianの通知を表示

#### 使い方例

```ts
const button = container.createEl('button', { text: '保存' });
button.addEventListener('click', () => {
  // 保存処理
  this.plugin.saveSettings();
});

dropdown.setValue('option1').onChange(value => {
  // 値が変わったときの処理
});
```

---

## 9. ウィジェット開発の最小要件

ウィジェットを新規作成する際に最低限必要な要素は以下の通りです。

### 1. ファイル・配置
- `src/widgets/` ディレクトリ内にウィジェットごとのファイルを作成（例: `MyWidget.ts`）

### 2. クラス定義
- `WidgetImplementation` インターフェースを実装したクラスを作成
- 必須プロパティ・メソッド：
    - `id: string`（ウィジェット種別ID）
    - `create(config, app, plugin): HTMLElement`（ウィジェットのDOM生成）

### 3. 設定・状態管理
- `config.settings` でウィジェットごとの設定値を管理
- 必要に応じて内部状態（state）をクラス内で管理

### 4. スタイル
- `styles.css` にウィジェット用のクラス（例: `.my-widget`）を追加
- 既存の `.widget`, `.widget-content` などの共通クラスを利用

### 5. プラグインへの登録
- メインプラグインファイルで新ウィジェットを登録し、追加できるようにする

---

**これらを満たせば、基本的なウィジェットとして動作します。**

ご不明点や追加情報が必要な場合はご連絡ください。 

---

## 10. 主要設定・管理ファイルの説明

### settingsDefaults.ts
- プラグイン全体や各ウィジェットの「デフォルト設定値」を定義するファイルです。
- 例：新規ボードやウィジェット追加時の初期値、各種ウィジェットのデフォルト設定オブジェクトなど。
- 設定の初期化やリセット時にも利用されます。

### settingsTab.ts
- Obsidianの「設定」画面に表示される「ウィジェットボード設定」タブのUI・ロジックを管理するファイルです。
- 各ウィジェットやボードの設定項目の追加・編集・保存処理を担当します。
- ユーザーがGUIで設定を変更できるようにするための中心的な役割を持ちます。

### widgetRegistry.ts
- プラグインで利用可能なウィジェットの「一覧・登録・管理」を行うファイルです。
- 各ウィジェットのクラスやメタ情報をまとめ、追加・削除・検索などの管理機能を提供します。
- 新しいウィジェットをプラグインに認識させる際に重要な役割を果たします。

---

## 11. パフォーマンス最適化・設計ベストプラクティス

### 11.1 差分更新UI
- updateDisplayやupdateMemoEditUIなど、値が変化した場合のみDOMを更新する差分更新方式を推奨
- 不要な再描画・再生成を避けることで、ウィジェット数が多い場合も快適な動作を維持

### 11.2 Mapによるインスタンス・状態管理
- widgetInstances, widgetStatesは必ずonunloadでクリーンアップ
- cleanupAllPersistentInstancesで全インスタンスのonunloadを呼び、Mapをクリア

### 11.3 イベントリスナーの管理
- addEventListenerで登録したリスナーはonunloadで必ずremove
- メモリリーク・多重登録を防ぐ

### 11.4 forEach/for文の最適化
- データ変換・集約はmap/filter/reduce等の関数型APIを優先
- UI生成や副作用が主目的の場合のみforEach/for文を使用

### 11.5 非同期処理の設計
- async/awaitは逐次で問題ない箇所が多いが、複数I/Oを並列化したい場合はPromise.allを活用
- ファイルI/Oや設定保存は逐次処理が安全

### 11.6 ディープコピーの統一
- JSON.parse(JSON.stringify(...))はlodash.clonedeepに統一
- 型安全・循環参照対応

### 11.7 仮想リスト・遅延描画
- ノート一覧など大量データは仮想スクロール（windowing）で描画範囲を限定
- IntersectionObserverやsetTimeoutで重いウィジェットは遅延描画

---

これらを守ることで、拡張性・保守性・パフォーマンスに優れたウィジェット開発が可能です。 

---

## 12. 実践ガイド・FAQ・トラブルシューティング

### 12.1 よくある開発パターン
- **状態を永続化したい場合**
    - `config.settings`に状態を保存し、`plugin.saveSettings()`で永続化
    - 例: タイマーの残り時間やメモ内容
- **複数インスタンスを区別したい場合**
    - `config.id`を必ず利用し、Mapでインスタンス・状態を管理
- **UIを動的に切り替えたい場合**
    - 差分更新方式（updateDisplay等）で値が変化した時のみDOMを更新
- **外部からウィジェット設定を更新したい場合**
    - `updateExternalSettings(newSettings, widgetId)`を実装し、外部から呼び出す

### 12.2 デバッグ・テストのコツ
- Obsidianの「開発者ツール」（Cmd+Opt+I）でconsole出力・DOM構造を確認
- `Notice('メッセージ')`でユーザー通知を活用
- ウィジェットの`onunload`でリソース解放・イベント解除を必ず行う
- 設定保存後は`plugin.saveSettings()`を忘れずに

### 12.3 トラブルシューティング
- **ウィジェットが表示されない**
    - クラス名・ID・createメソッドの戻り値を再確認
    - DOM生成時にエラーが出ていないかconsoleで確認
- **設定が保存されない/反映されない**
    - `config.settings`の更新と`plugin.saveSettings()`の呼び出しを確認
- **イベントリスナーが多重登録される/解除されない**
    - `onunload`で必ずremoveEventListenerを呼ぶ
- **パフォーマンスが悪い**
    - 差分更新UI・仮想リスト・遅延描画の導入を検討

### 12.4 参考リンク・リソース
- Obsidian公式APIリファレンス: https://publish.obsidian.md/api/
- Obsidianコミュニティフォーラム: https://forum.obsidian.md/
- プラグイン開発テンプレート: https://github.com/obsidianmd/obsidian-sample-plugin

---

これらを活用し、より実践的かつトラブルに強いウィジェット開発を目指してください。 