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
 * @param component     ObsidianのComponentインスタンス（new Component() で渡す）
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

  // 2) MarkdownRenderer.renderMarkdown で描画
  await MarkdownRenderer.renderMarkdown(
    markdownText,
    offscreenDiv,
    typeof sourcePath === "string" ? sourcePath : (sourcePath as TFile).path,
    component
  );

  // 3) オフスクリーンdivをbodyから外す（ここでreflowが1回走るが、画面外なので影響最小）
  document.body.removeChild(offscreenDiv);

  // 4) fragmentに全ノードをimportNodeでバッチ化
  const frag = document.createDocumentFragment();
  while (offscreenDiv.firstChild) {
    const clone = document.importNode(offscreenDiv.firstChild, true);
    frag.appendChild(clone);
    offscreenDiv.removeChild(offscreenDiv.firstChild);
  }

  // 5) containerに一度だけappendChild（ここでreflowが1回だけ）
  container.appendChild(frag);
}

/**
 * renderMarkdownBatchWithCache
 *
 * MarkdownテキストごとにDocumentFragmentをキャッシュし、
 * 同じテキストの場合はcloneNodeで即座にappendする。
 *
 * @param markdownText  ユーザーが入力した Markdown 文字列
 * @param container     最終的に描画先となる HTMLElement
 * @param sourcePath    レンダリングルールを適用するためのファイルパスまたはTFile
 * @param component     ObsidianのComponentインスタンス（new Component() で渡す）
 */
const markdownCache = new Map<string, DocumentFragment>();

export async function renderMarkdownBatchWithCache(
  markdownText: string,
  container: HTMLElement,
  sourcePath: string | TFile,
  component: Component
) {
  if (markdownCache.has(markdownText)) {
    const cached = markdownCache.get(markdownText)!.cloneNode(true) as DocumentFragment;
    container.appendChild(cached);
    return;
  }
  // 通常のバッチ描画
  const offscreenDiv = document.createElement("div");
  offscreenDiv.style.position = "absolute";
  offscreenDiv.style.top = "-9999px";
  offscreenDiv.style.width = "0px";
  offscreenDiv.style.height = "0px";
  document.body.appendChild(offscreenDiv);

  await MarkdownRenderer.renderMarkdown(
    markdownText,
    offscreenDiv,
    typeof sourcePath === "string" ? sourcePath : (sourcePath as TFile).path,
    component
  );

  document.body.removeChild(offscreenDiv);

  const frag = document.createDocumentFragment();
  while (offscreenDiv.firstChild) {
    const clone = document.importNode(offscreenDiv.firstChild, true);
    frag.appendChild(clone);
    offscreenDiv.removeChild(offscreenDiv.firstChild);
  }
  // キャッシュに保存
  markdownCache.set(markdownText, frag.cloneNode(true) as DocumentFragment);
  container.appendChild(frag);
} 