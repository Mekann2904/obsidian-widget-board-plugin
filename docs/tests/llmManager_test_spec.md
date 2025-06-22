# LLMManager テスト仕様書

## 概要
- 対象: `src/llm/llmManager.ts`
- 目的: `LLMManager`クラスの機能、特にプロバイダの管理とデフォルト呼び出しのロジックを検証する

---

## テストケース一覧

| No. | テスト内容                                        | 目的                                                     |
|-----|---------------------------------------------------|----------------------------------------------------------|
| 1   | `generateReplyWithDefault`が登録済みのgeminiプロバイダを使用 | デフォルトプロバイダとして`gemini`が正しく呼び出されるか |
| 2   | geminiプロバイダ未登録時に`generateReplyWithDefault`がエラーをスロー | プロバイダが見つからない場合に適切にエラーを投げるか     |

---

## 各テストケース詳細

### 1. `generateReplyWithDefault`が登録済みのgeminiプロバイダを使用
- **テスト対象**: `LLMManager.generateReplyWithDefault`
- **目的**: `LLMManager`が、`gemini`プロバイダが登録されている場合に、デフォルトとして正しくそれを使用することを検証する
- **前提条件**:
  - `generateReply`メソッドを持つモック`gemini` `LLMProvider`を作成し、"ok"を返すように設定
  - 呼び出されないことを確認するために、別のモック`LLMProvider` ('other') を作成
  - Geminiの設定（APIキーとモデル）を持つモック`plugin`オブジェクトを作成
  - モック`plugin`で`LLMManager`をインスタンス化
  - `gemini`と`other`の両プロバイダをマネージャーに登録
- **入力値・操作**:
  - `generateReplyWithDefault`メソッドをサンプルプロンプトで呼び出す
- **期待結果**:
  - メソッドが`gemini`プロバイダから "ok" の値を返す
  - `gemini`プロバイダの`generateReply`メソッドが、正しいプロンプトとコンテキスト（設定からのAPIキーとモデルを含む）で呼び出される
  - `other`プロバイダの`generateReply`メソッドは呼び出されない

### 2. geminiプロバイダ未登録時に`generateReplyWithDefault`がエラーをスロー
- **テスト対象**: `LLMManager.generateReplyWithDefault`
- **目的**: `gemini`プロバイダが登録されていない状態で`generateReplyWithDefault`が呼び出された場合に、`LLMManager`がエラーをスローすることを確認する
- **前提条件**:
  - 空の設定を持つモック`plugin`オブジェクトを作成
  - モック`plugin`で`LLMManager`をインスタンス化
  - プロバイダを一切登録しない
- **入力値・操作**:
  - `generateReplyWithDefault`メソッドを呼び出す
- **期待結果**:
  - メソッドが「LLM provider not found」というエラーを投げてリジェクトされる 