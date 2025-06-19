// Mermaid描画専用Web Worker
// CDNからmermaidをimport
// @ts-expect-error importScripts may not exist in all worker contexts
self.importScripts('https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js');

declare const mermaid: {
  mermaidAPI: {
    render: (
      id: string,
      code: string,
      cb: (svgCode: string) => void,
      container: HTMLElement
    ) => void;
  };
};

self.onmessage = async (e) => {
  const { code, id } = e.data;
  try {
    // mermaidAPI.renderはコールバック形式なのでPromise化
    const svg = await new Promise<string>((resolve) => {
      // @ts-expect-error mermaid global is injected via importScripts
      mermaid.mermaidAPI.render(id, code, (svgCode: string) => {
        resolve(svgCode);
      }, document.createElement('div'));
    });
    self.postMessage({ svg, id });
  } catch (err) {
    self.postMessage({ error: err.message, id });
  }
}; 