# Mermaid Worker描画ユーティリティ テスト仕様書

## 1. テスト対象

- モジュール: `src/utils/mermaidRenderWorkerClient.ts`
- メソッド: `renderMermaidInWorker(code: string, id: string): Promise<string>`

---

## 2. テストの目的

- Mermaid記法の文字列をWeb Worker経由でSVG文字列に正しく変換できることを確認する。
- 不正なMermaid記法の場合、適切にエラーが返されることを確認する。

---

## 3. 前提条件

- Node.jsおよびJest等のテストランナーがセットアップ済みであること
- `src/utils/mermaidWorker.ts` および `src/utils/mermaidRenderWorkerClient.ts` が正しく配置されていること
- テスト実行環境がWeb Workerをサポートしていること（Jestのjsdom環境等）

---

## 4. 入力値・操作

| テストケース | code（Mermaid記法）         | id         | 実行方法                                 |
|--------------|----------------------------|------------|------------------------------------------|
| 正常系       | `graph TD; A-->B;`         | `test1`    | `renderMermaidInWorker(code, id)` を呼ぶ |
| 異常系       | `graph TD; A-=>B;`（誤記） | `test2`    | `renderMermaidInWorker(code, id)` を呼ぶ |

---

## 5. 期待結果

### 正常系
- 戻り値はSVG文字列（`<svg ...>...</svg>` を含む）
- SVG内に `A--&gt;B` というエッジ表現が含まれる

### 異常系
- Promiseがrejectされる（エラーが返る）

---

## 6. 実行手順・手順詳細

1. テスト環境で `jest` などのテストランナーを起動する
2. `__tests__/utils/mermaidRenderWorkerClient.test.ts` を実行する
3. 各テストケースで `renderMermaidInWorker` を呼び出し、期待結果と照合する

---

## 7. 実施結果の記録欄

| テストケース | 実施日 | 実施者 | 結果（合否） | 実際の出力・備考           |
|--------------|--------|--------|--------------|----------------------------|
| 正常系       |        |        |              |                            |
| 異常系       |        |        |              |                            |

</rewritten_file> 