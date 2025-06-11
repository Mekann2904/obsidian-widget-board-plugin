# Obsidian MCP連携機能 利用方法

## 概要

このディレクトリのコードは、ObsidianプラグインからMCP（Model Context Protocol）サーバーと連携し、AIツールや外部ツールを呼び出すための仕組みを提供します。

- **内部MCPサーバ**: プラグインが子プロセスとしてMCPサーバスクリプト（Python/Node.js等）を起動し、HTTP経由でツールを呼び出します。
- **外部MCPサーバ**: 既に起動済みのMCP HTTPサーバ（例: http://localhost:3000/mcp）にfetchでアクセスします。

---

## サーバーの起動・停止について

- **MCPサーバーの起動・停止はObsidianプラグイン側で自動的に行われます。**
- 設定画面で「MCPサーバパス」に**スクリプトのパス**を指定した場合、プラグインが子プロセスとしてサーバーを起動・停止します。
- **URLを指定した場合**は、外部サーバーとして扱い、起動・停止は行いません（外部サーバーは自分で管理してください）。
- プラグイン終了時には自動でサーバープロセスを停止します。

---

## 1. 必要な準備

- MCPサーバースクリプト（例: `mcp_server.py` や `mcp_server.js`）を用意
- Obsidianプラグインの設定画面で「MCPサーバパス」を設定
  - 内部サーバ: サーバスクリプトのパス（例: `/Users/xxx/mcp_server.py`）
  - 外部サーバ: HTTPエンドポイントのURL（例: `http://localhost:3000/mcp`）
  - サーバスクリプトは `--port <番号>` 引数または `PORT` 環境変数で待受ポートを指定できます（既定は3100）

---

## 2. 使い方（API例）

### インスタンス化

```ts
import { MCPHttpClient } from './llm/mcp';

// 内部サーバ（スクリプトパス指定）
const mcp = new MCPHttpClient('/path/to/mcp_server.py', 3000);

// 外部サーバ（URL指定）
const mcp = new MCPHttpClient('http://localhost:3000/mcp');
```

### サーバ起動・停止（内部サーバのみ）
```ts
mcp.startServer(); // サーバ起動
mcp.stopServer();  // サーバ停止
```

### ツール一覧取得
```ts
const tools = await mcp.listTools();
```

### ツール呼び出し
```ts
const result = await mcp.callTool('dice', { sides: 6 });
```

---

## 3. 外部MCPサーバ利用時の注意

- サーバの起動・停止は**自分で管理**してください（プラグインは起動しません）
- 設定画面で「MCPサーバパス」に**URL**を指定
- サーバがダウンしているとリクエストは失敗します
- サーバのエンドポイントは**`/mcp`**である必要があります

---

## 4. TweetWidget等からの連携

- `@ツール名 引数...` で投稿すると、MCPツールが呼び出され、その結果が新規ポストとして追加されます
- 例:
  ```
  @dice 6
  ```
  → MCPサーバーの `dice` ツールが呼ばれ、結果がポストされる

---

## 5. 注意事項

- サーバースクリプトのパスやポートは環境に合わせて設定してください
- サーバープロセスはプラグイン終了時に自動で停止されます（内部サーバの場合）
- MCPサーバーはPython/Node.js等のランタイムが必要です
- セキュリティ上、信頼できるスクリプト・サーバのみ指定してください

---

## 6. 参考

- [azukiazusa.dev MCP Streamable HTTP transport解説](https://azukiazusa.dev/blog/mcp-server-streamable-http-transport/)

---

ご不明点や追加の使い方サンプルが必要な場合はご相談ください。 