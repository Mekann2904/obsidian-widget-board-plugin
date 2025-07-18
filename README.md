# Obsidian Widget Board Plugin

[note記事 Obsidianプラグイン「obsidian-widget-board-plugin」リリースしました](https://note.com/mekann/n/ne05f32922b9e?sub_rt=share_sb)  
[obsidian-widget-board-plugin 導入方法を簡単にまとめる](https://note.com/mekann/n/n7c593c276d5b)

[English README is available here.](README.en.md)

## 目次

1. [概要](#概要)
2. [クイックスタート](#クイックスタート)
3. [主な機能](#主な機能)
4. [使い方](#使い方)
5. [ユーザプロンプト機能](#ユーザプロンプト機能ai要約aiリプライのカスタマイズ)
6. [開発者向け](#開発者向けパフォーマンス最適化)
7. [インストール](#インストール)
8. [ライセンス](#ライセンス)

## 概要

Obsidian Widget Board Pluginは、Obsidian上で「ウィジェットボード」を作成し、複数の便利なウィジェット（ポモドーロタイマー、メモ、カレンダー、タイマー/ストップウォッチ、最近編集したノート、テーマ切り替え等）を自由に配置・管理できるプラグインです。

> **ウィジェットの自作・拡張方法については [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) およびパフォーマンス設計指針 [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md) も必ずご参照ください。**
> **ポモドーロ作業ログのファイル形式については [logs/README.md](logs/README.md) もご参照ください。**

---

## クイックスタート

1. Obsidian の **設定 → コミュニティプラグイン** から本プラグインを有効化します。
2. サイドバーの「ウィジェットボード」アイコンをクリックして初期ボードを開きます。
3. 設定画面の **ボード管理** からウィジェットを追加・並べ替えて自分好みにカスタマイズします。
4. つぶやきウィジェットなどを利用する場合は、保存先フォルダなど初期設定を行ってください。

## 前提条件

このリポジトリをクローンしてビルドする場合は以下が必要です。

- Node.js 16 以上
- npm (推奨: 最新版)

ビルド手順は次の通りです。

```bash
npm install
npm run build
```

生成されたファイルを `<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/` に配置してください。

---

## 主な機能

- **ウィジェットボードの作成・複数管理**
    - 複数のボードを作成し、用途ごとにウィジェットを自由に追加・並べ替えできます。
    - ボードごとに表示モード（パネル幅）を選択可能。
- **ウィジェットの種類**
    - ポモドーロタイマー
    - メモ（Markdown対応）
    - カレンダー
    - タイマー/ストップウォッチ
    - 最近編集したノート一覧
    - テーマ切り替え
    - **つぶやき（tweet-widget）**
- **各ウィジェットは個別にタイトル・設定を持ち、ボード内で自由に並べ替え・削除が可能**
- **通知音や音量などの全体設定・個別設定**
 - **ホットキーで各ボードを素早く開閉**
- **ポモドーロ作業ログの自動エクスポート（CSV/JSON/Markdown）**
- **独自ウィジェットの追加・開発も可能です。詳しくは [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) および [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md) を必ずご参照ください。**

---

## 使い方

### 1. ボードの作成・管理
- 設定画面の「ボード管理」から新しいボードを追加できます。
- ボードごとにウィジェットを追加・並べ替え・削除できます。
- ボード名や初期表示モードも設定可能です。

### 2. ウィジェットの追加・編集
- ボード詳細設定内の「ウィジェット管理」から各種ウィジェットを追加できます。
- 追加したウィジェットはタイトル変更・並べ替え・削除が可能です。
- 各ウィジェットの詳細設定（例：ポモドーロの作業時間や通知音、メモ内容、カレンダーの表示など）も個別に編集できます。
- **追加できるウィジェットの種類は、プラグイン内で登録されたもの（`src/widgetRegistry.ts`参照）に限られます。新しいウィジェットを追加したい場合は、`widgetRegistry.ts`での登録とプラグインの再読み込みが必要です。**
- **独自ウィジェットの追加・開発方法については [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) および [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md) をご覧ください。パフォーマンス設計指針も必ずご確認ください。**

### 3. ホットキー
- 各ボードには「開く」「閉じる」「トグル」用のホットキーを設定できます（Obsidianのホットキー設定画面から割り当て）。
- ボードを素早く開閉したい場合に便利です。

### 4. ポモドーロ作業ログのエクスポート
- ポモドーロタイマーのセッション終了時に、作業ログをCSV/JSON/Markdown形式で自動保存できます。
- 保存先はプラグインフォルダ内の`logs`サブフォルダ。
- エクスポート形式はウィジェットごとに設定可能です。
- CSVはBOM付き・エスケープ済み、Markdownは改行やテーブル崩れに配慮。
- **→ 各ログファイルの形式や活用法については [logs/README.md](logs/README.md) をご覧ください。**

---

## 各ウィジェットの特徴

### ● ポモドーロタイマー
- 作業・休憩・長い休憩のサイクルを柔軟に管理
- セッションごとに作業ログ（開始/終了時刻・メモ）を自動記録
- メモ機能と連携し、Markdownで作業メモを記録・編集可能
- 通知音・音量の全体設定と個別設定
- 作業ログはCSV/JSON/Markdown形式でエクスポート可能
- バックグラウンド画像設定やサイクル自動管理も対応

### ● メモ
- Markdown対応のメモウィジェット
- 高さ自動調整・固定高さの切り替えが可能
- 差分更新UIで効率的に編集・保存
- バッチresize・パフォーマンス最適化済み

### ● カレンダー
- シンプルな月表示カレンダー
- 前月・翌月の切り替えが可能
- 今日の日付を強調表示
- 差分更新UIで軽快な操作感
- 週の開始曜日を設定で変更可能（デフォルトは月曜）

### ● タイマー/ストップウォッチ
- タイマーとストップウォッチを切り替えて利用可能
- タイマー終了時に通知音
- 分・秒単位でタイマー設定
- 差分更新UI・グローバルtickでパフォーマンス最適化

### ● 最近編集したノート
- 最近編集したMarkdownノートを一覧表示
- ノート名クリックで即座にノートを開ける
- 表示件数は設定可能
- 100件以上の場合は仮想リストで高速描画

### ● テーマ切り替え
- Obsidianのテーマをワンクリックで切り替え
- 現在のテーマが分かりやすく表示
- テーマ一覧は自動取得・即時反映

### ● ファイルビューア
- 任意のMarkdownファイルを選択・内容をプレビュー表示
- Obsidianで直接開くボタン付き
- 高さ自動/固定切り替え、リンククリックでノートジャンプ
 - Markdownレンダリングはバッチ・キャッシュ最適化（最大1000件LRUキャッシュ）

### ● つぶやき
- 投稿・スレッド・詳細表示ができる新ウィジェット
- 投稿欄（アバター・テキスト・画像/GIF添付・太字/斜体・絵文字・位置情報・文字数カウント・投稿ボタン）
- 投稿リストはスレッド（親子リプライ）構造で時系列表示
- 投稿クリックで「詳細表示モード」へ遷移し、親・自分・子リプライを分割表示
- 詳細表示時は上部にヘッダー、下部に返信欄を常時表示
- 返信ボタン押下時は画面中央にポップアップ（モーダル）で返信入力欄を表示
- 投稿の保存・編集・削除・いいね・リツイート・画像/GIF添付・太字/斜体・絵文字・位置情報・ブックマーク等多機能
- 投稿データは専用DBファイルで管理。Vault内の任意フォルダをベースフォルダとして指定可能
- 投稿の非表示・完全削除・復元・フィルタ（すべて／通常／非表示／ブックマーク）機能
- ContextNote（関連ノート）作成・リンク機能
- 投稿を指定日時に自動投稿するスケジュール機能（週次や期間指定も可能）
- UI/UX・デザインは他ウィジェットと統一感を重視
- レスポンシブ対応・アクセシビリティ向上

### ● 振り返りレポート（reflection-widget）
- 直近7日間の「つぶやき」投稿数をグラフで可視化
- AI（Gemini等）による「今日のまとめ」「今週のまとめ」を自動生成・表示
- 投稿データは「つぶやき」ウィジェットと連携し、Vault内DBから自動集計
- グラフ・要約は差分更新・CSS Containmentでパフォーマンス最適化
- AI要約はVault内`data.json`にキャッシュ保存、再利用・手動再生成も可能
- レスポンシブ対応・アクセシビリティ配慮

> **独自ウィジェットの追加・開発も可能です。詳しくは [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) および [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md) を参照してください。**

---

## 設定・カスタマイズ

- 各ウィジェットの詳細設定は「ボード詳細設定」→「ウィジェット管理」から編集できます。
- 通知音や音量などの全体設定も用意。
- ポモドーロの作業ログエクスポート形式もここで選択可能。
- **ウィジェットごとの設定項目は、各ウィジェットの実装（`src/widgets/`配下）で定義されています。**

### つぶやきウィジェットの主な設定
- グローバル設定でDB保存先(ベースフォルダ)やユーザーアイコンURLを一括管理
- ベースフォルダはVault内のフォルダのみサジェスト・選択可能
  (フォルダのみを指定した場合は自動的に`tweets.json`が付加されます)
- ベースフォルダを指定している場合は
  `ベースフォルダ/tweets.json` に保存されます
- ContextNoteはベースフォルダの下（例: myfolder/ContextNotes/）に生成
- 投稿欄・リスト両方でアバター画像のグローバル設定が反映
- サジェストやバリデーションでユーザーの誤操作を防止
- 投稿データは`deleted: true`で非表示フラグ管理。完全削除（物理削除）も可能
- 投稿リスト上部に「すべて」「通常のみ」「非表示のみ」「ブックマーク」フィルタUI
- 非表示ツイートには「復元」「完全削除」ボタン、通常ツイートには「非表示」「完全削除」ボタン
- ContextNoteはDBカスタムパスの下（例: myfolder/ContextNotes/）に生成
- 返信はモーダルUIで快適に入力可能

## ユーザプロンプト機能（AI要約・AIリプライのカスタマイズ）

### 概要

LLM（AI）を使った要約やAIリプライのプロンプト（指示文）を、ユーザー自身で自由にカスタマイズできる「ユーザプロンプト」機能を搭載しています。

- **グローバル設定 > LLM（グローバル設定）** から、各用途ごとにカスタムプロンプトを設定できます。
- 空欄の場合は、プラグインが用意したデフォルトのプロンプトが使われます。
- つぶやきウィジェット（AIリプライ）、振り返りウィジェット（今日・今週のまとめ）でそれぞれ個別に設定可能です。
- さらに、つぶやきAI返信用と振り返りAI要約用のモデル名もここで指定できます（空欄時は共通モデル名を使用）。
- デバッグログを有効にすると、送信プロンプトやモデル名などの情報がコンソールに表示されます。

### 使い方

1. **設定画面を開く**
   - Obsidianの「設定」→「ウィジェットボード」→「LLM（グローバル設定）」を開きます。
2. **ユーザプロンプト欄に入力**
   - 「ユーザプロンプト（つぶやき用）」「ユーザプロンプト（今日用）」「ユーザプロンプト（今週用）」の各欄に、AIに渡したい指示文（プロンプト）を日本語で自由に記述します。
   - 例: 「あなたは親しみやすいカウンセラーです。以下の投稿を読んで、やさしく共感的に返信してください。」
   - `{tweet}` `{postDate}` `{posts}` などの変数は自動で投稿内容や日付に置換されます。
3. **空欄の場合はデフォルトプロンプトが使われます**
   - 何も入力しなければ、従来通りのAI要約・リプライが動作します。

#### 使える変数について

ユーザプロンプト内では、以下の変数を使うことができます。これらはAIに渡す際に自動で内容に置換されます。

- `{tweet}` : つぶやきウィジェットで返信対象となる投稿やスレッド全体のテキストが入ります。
- `{postDate}` : 投稿日時や時間帯の情報が入ります（例: "2024年6月1日 10時30分（この時間帯は「朝」です）"）。
- `{posts}` : 振り返りウィジェットで要約対象となる複数の投稿一覧が入ります。

これらの変数をプロンプト内に含めることで、AIが正しく投稿内容や日付情報を参照できます。

#### デフォルトプロンプト・参考例について

- 本プラグインで用意しているデフォルトプロンプトや参考例は、[src/llm/gemini/summaryPrompts.ts](src/llm/gemini/summaryPrompts.ts) および [src/llm/gemini/tweetReplyPrompt.ts](src/llm/gemini/tweetReplyPrompt.ts)にまとめています。
- より高度なカスタマイズや例文の参考にしたい場合は、これらのファイルを直接ご覧ください。

### 用途・活用例

- AIの返信トーンや分析視点を自分好みにカスタマイズしたい場合
- 特定の心理学的観点や専門用語を使いたい場合
- 返信文体（敬語・フランク・箇条書き禁止など）を細かく指定したい場合
- チームやプロジェクトごとにAIの振る舞いを変えたい場合

### 注意点

- 変数（`{tweet}` `{postDate}` `{posts}` など）は必ず残しておくと、AIが正しく内容を参照できます。
- 長すぎるプロンプトや複雑すぎる指示は、AIの応答速度や品質に影響する場合があります。
- カスタムプロンプトの内容によっては、AIの応答が意図しないものになる場合もあります。必要に応じて調整してください。

---

## 開発者向け・パフォーマンス最適化

- **独自ウィジェットの開発・拡張を行う場合は、必ず [WIDGET_DEV_GUIDE.md](docs/WIDGET_DEV_GUIDE.md) および [WIDGET_PERFORMANCE_GUIDE.md](docs/WIDGET_PERFORMANCE_GUIDE.md) をご参照ください。**
- 開発フロー、WidgetImplementation実装例、パフォーマンス設計チェックリスト、FAQなどを網羅しています。
- パフォーマンス最適化（バッチ化・仮想リスト・contain・read→write分離等）は全ウィジェットで必須です。
- 開発・レビュー時はパフォーマンスガイドのチェックリストを必ず確認し、DevTools等でreflow・描画コストも計測してください。

### コード品質チェック（ESLint）

本リポジトリでは [ESLint](https://eslint.org/) を利用してTypeScriptコードの静的解析・品質チェックを行っています。

#### 基本的な使い方

```bash
# src配下の.tsファイルをチェック
eslint ./src --ext .ts
```

#### デバッグモード

ESLintの詳細な動作ログを確認したい場合は `--debug` オプションを付与してください。

```bash
eslint ./src --ext .ts --debug
```

- ルールや設定の詳細、トラブルシューティングは [docs/ESLINT_GUIDE.md](docs/ESLINT_GUIDE.md) を参照してください。

### テスト実行方法

本リポジトリでは Jest を利用した簡単なテストを用意しています。依存パッケージをインストールした上で以下のコマンドを実行してください。

```bash
npm test
```

テストのディレクトリ構成や追加方法などの詳細は [docs/tests/README.md](docs/tests/README.md) を参照してください。

---

## テスト充実計画・チェックリスト

本プラグインの品質向上のため、テスト拡充の計画・カテゴリ・観点を
[docs/tests/README.md](docs/tests/README.md) にまとめています。

- ウィジェット単位のテスト
- ユーティリティ・共通関数のテスト

詳細なチェックリスト・観点は [docs/tests/README.md](docs/tests/README.md) をご覧ください。

---

## 注意事項・その他

 - ホットキーでボードの開閉を個別に設定できます。
- ボードやウィジェットの追加・削除・名前変更は即時反映されます。
- ポモドーロの作業ログは重複排除なしで全件保存されます（必要に応じてコードで切り替え可能）。
- エクスポートファイルは`<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/logs/`に保存されます。
- **ウィジェットの種類追加・削除は、`widgetRegistry.ts`の編集とプラグインの再読み込みが必要です。**
- **新しいウィジェットが追加候補に出ない場合は、`widgetRegistry.ts`での登録漏れやプラグインの再読み込み、またはパフォーマンス設計指針未遵守による不具合の可能性もご確認ください。**

---

## 既知の問題

- ボード追加・削除・名前変更時、Obsidianの「ホットキー」画面のコマンド一覧はプラグインの再読み込み（Obsidian再起動またはプラグインの無効化→有効化）で反映されます。
- ボードやウィジェットの大量追加・削除を短時間で繰り返すと、UIの一部が正しく更新されない場合があります（その場合は設定画面を再度開き直してください）。
- ポモドーロの作業ログエクスポートはVault外のファイルや他プラグインとの競合には非対応です。
- Obsidianのバージョンやテーマによっては一部UIが崩れる場合があります。
- その他、細かな不具合やご要望はGitHub Issue等でご報告ください。
- **新しいウィジェットが追加候補に出ない場合は、`widgetRegistry.ts`での登録漏れやプラグインの再読み込みを確認してください。**

---

## インストール

Obsidian Widget Board Pluginの導入方法は主に2つあります。

### 1. GitHubリリースから手動インストール

1. [GitHubリリースページ](https://github.com/Mekann2904/obsidian-widget-board-plugin/releases)から`obsidian-widget-board-plugin.zip`をダウンロードします。
2. zipファイルを解凍し、Obsidianのプラグインフォルダ（`<Vault>/.obsidian/plugins/obsidian-widget-board-plugin/`）に移動させます。
3. Obsidianの設定画面から本プラグインを有効化してください。

### 2. BRATプラグインを使ってインストール（おすすめ）

BRAT（Beta Reviewers Auto-update Tool）プラグインを使うと、より簡単に導入・アップデートができます。

1. Obsidianのコミュニティプラグインから「BRAT」を検索・インストールします。
2. BRATの設定画面で「Add Beta Plugin」から本プラグインのGitHubリポジトリURL（ `https://github.com/Mekann2904/obsidian-widget-board-plugin`）を追加します。
3. 追加後、BRAT経由で本プラグインをインストール・有効化できます。

> **BRATを使う方法が最も簡単でおすすめです。アップデートも自動で反映されるはずです。**

---

## ライセンス

MIT
