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
  if (typeof sourcePath === "string" && sourcePath.trim() === "") {
    sourcePath = "__virtual.md";
  }
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

  // 4) fragmentに全ノードを直接移動してバッチ化
  const frag = document.createDocumentFragment();
  while (offscreenDiv.firstChild) {
    frag.appendChild(offscreenDiv.firstChild);
  }

  // 5) containerに一度だけappendChild（ここでreflowが1回だけ）
  container.appendChild(frag);
}

// LRUCacheクラスの実装
class LRUCache<K, V> {
  private maxSize: number;
  private map: Map<K, V>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }
}

// 最大1000件までキャッシュ
const markdownCache = new LRUCache<string, DocumentFragment>(1000);

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
export async function renderMarkdownBatchWithCache(
  markdownText: string,
  container: HTMLElement,
  sourcePath: string | TFile,
  component: Component
) {
  if (typeof sourcePath === "string" && sourcePath.trim() === "") {
    sourcePath = "__virtual.md";
  }
  const cached = markdownCache.get(markdownText);
  if (cached) {
    const clone = cached.cloneNode(true) as DocumentFragment;
    container.appendChild(clone);
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
    frag.appendChild(offscreenDiv.firstChild);
  }
  // キャッシュに保存
  markdownCache.set(markdownText, frag.cloneNode(true) as DocumentFragment);
  container.appendChild(frag);
}
