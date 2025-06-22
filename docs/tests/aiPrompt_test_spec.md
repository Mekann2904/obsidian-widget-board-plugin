# AIプロンプト連携 テスト仕様書

## 概要
- 対象: `src/widgets/tweetWidget/aiReply.ts`, `src/widgets/reflectionWidget/reflectionWidget.ts`
- 目的: AIプロンプトの生成、LLM呼び出し、設定反映に関する仕様を検証する

---

## テストケース一覧

| No. | テスト内容                                 | 目的                                     |
|-----|--------------------------------------------|------------------------------------------|
| 1   | `generateAiReply`のカスタムプロンプト・モデル置換 | `generateAiReply`がカスタム設定を正しく利用するか |
| 2   | `generateAiReply`のエラー時コールバック呼び出し | `generateAiReply`がエラー時に`onError`を呼び出すか |
| 3   | `ReflectionWidget`のカスタムプロンプト・モデル利用 | `ReflectionWidget`がカスタム設定を正しく利用するか |
| 4   | `loadReflectionSummaryShared`のキャッシュ機能 | `loadReflectionSummaryShared`が結果をキャッシュするか |

---

## 各テストケース詳細

### 1. `generateAiReply`のカスタムプロンプト・モデル置換
- **テスト対象**: `generateAiReply`
- **目的**: ユーザー定義のプロンプトとモデルが正しく置換され、AIリプライ生成に使用されるか検証する
- **前提条件**:
  - `GeminiProvider.generateReply`をモック化
  - サンプルの`TweetWidgetPost`を用意
  - `llmGemini`設定でカスタム`apiKey`と`model`を指定
  - `userTweetPrompt`にプレースホルダーを含むカスタムプロンプトを設定
- **入力値・操作**:
  - `generateAiReply`をテスト用のツイート、設定、モック関数で呼び出す
- **期待結果**:
  - `GeminiProvider.generateReply`が呼び出される
  - `generateReply`に渡されるプロンプトにカスタムプロンプトとツイート内容が含まれる
  - プロンプト内のプレースホルダー `{tweet}`, `{postDate}` が実際の値で置換される
  - `generateReply`に渡されるコンテキストの`model`がカスタムモデルである

### 2. `generateAiReply`のエラー時コールバック呼び出し
- **テスト対象**: `generateAiReply`
- **目的**: AIリプライ生成が失敗した際に`onError`コールバックが呼び出されるか検証する
- **前提条件**:
  - `GeminiProvider.generateReply`がエラーを返すようにモック化
  - `onError`コールバック関数をモック化
- **入力値・操作**:
  - `generateAiReply`を`onError`モックを含むパラメータで呼び出す
- **期待結果**:
  - `onError`関数が呼び出される

### 3. `ReflectionWidget`のカスタムプロンプト・モデル利用
- **テスト対象**: `ReflectionWidget`
- **目的**: `ReflectionWidget`がサマリー生成時にカスタムプロンプトとモデルを正しく利用するか検証する
- **前提条件**:
  - `App`と`Plugin`オブジェクトをモック化し、カスタムプロンプト (`userSummaryPromptToday`)、カスタムAIモデル (`reflectionAiModel`)、モック化した`llmManager`を含むように設定
  - `ReflectionWidget`用の`WidgetConfig`を用意
- **入力値・操作**:
  - `ReflectionWidget`をインスタンス化
  - `create`メソッドを呼び出す
  - ウィジェットUI内の`runSummary`メソッドを実行する
- **期待結果**:
  - `llmManager`の`generateReplyWithDefault`メソッドが呼び出される
  - `generateReplyWithDefault`に渡されるプロンプトにカスタムサマリーテキストと投稿内容が含まれる
  - プロンプト内のプレースホルダー `{posts}` が置換される
  - コンテキスト内の`model`がカスタムモデル (`model-x`) である

### 4. `loadReflectionSummaryShared`のキャッシュ機能
- **テスト対象**: `loadReflectionSummaryShared`
- **目的**: `loadReflectionSummaryShared`が不要なファイル読み込みを避けるために、ロードしたリフレクションサマリーをキャッシュすることを検証する
- **前提条件**:
  - `app.vault.adapter`をモック化し、リフレクションサマリーを含むファイルの読み込みをシミュレートする
- **入力値・操作**:
  - `loadReflectionSummaryShared`を同じ引数 (`period`, `date`) で2回呼び出す
- **期待結果**:
  - `adapter.read`メソッドは1回しか呼び出されない
  - `loadReflectionSummaryShared`の2回の呼び出し結果が同一である 