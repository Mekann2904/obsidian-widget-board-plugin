import { MarkdownRenderer, TFile, Component } from "obsidian";

/**
 * renderMarkdownBatch
 *
 * Obsidian の MarkdownRenderer.render を"仮のオフスクリーン要素"で実行し、
 * 生成された DOM ノード群を DocumentFragment にまとめたうえで
 * まとめて"container"に差し込むラッパー関数。
 *
 * @param markdownText  ユーザーが入力した Markdown 文字列
 * @param container     最終的に描画先となる HTMLElement
 * @param sourcePath    レンダリングルールを適用するためのファイルパスまたはTFile
 * @param component     ObsidianのComponentインスタンス（new Component(app) で渡す）
 */
export async function renderMarkdownBatch(
  markdownText: string,
  container: HTMLElement,
  sourcePath: string | TFile,
  component: Component
) {
  // 1) オフスクリーンの一時コンテナを作る
  const offscreenDiv = document.createElement("div");
  offscreenDiv.style.position = "absolute";
  offscreenDiv.style.top = "-9999px";
  offscreenDiv.style.width = "0px";
  offscreenDiv.style.height = "0px";
  document.body.appendChild(offscreenDiv);

  // 2) MarkdownRenderer.render を使って、一時コンテナにだけ描画
  await MarkdownRenderer.renderMarkdown(
    markdownText,
    offscreenDiv,
    typeof sourcePath === "string" ? sourcePath : (sourcePath as TFile).path,
    component
  );

  // 3) 一時コンテナからすべての子ノードを DocumentFragment にまとめる
  const frag = document.createDocumentFragment();
  while (offscreenDiv.firstChild) {
    frag.appendChild(offscreenDiv.firstChild);
  }

  // 4) document.body から offscreenDiv を削除
  document.body.removeChild(offscreenDiv);

  // 5) まとめたフラグメントを一度だけ container に差し込む
  container.appendChild(frag);
} 