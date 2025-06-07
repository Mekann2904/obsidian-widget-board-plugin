// Mermaid描画専用Web Worker
// CDNからmermaidをimport
// @ts-ignore
self.importScripts('https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js');

self.onmessage = async (e) => {
  const { code, id } = e.data;
  try {
    // mermaidAPI.renderはコールバック形式なのでPromise化
    const svg = await new Promise((resolve, reject) => {
      // @ts-ignore
      mermaid.mermaidAPI.render(id, code, (svgCode) => {
        resolve(svgCode);
      }, document.createElement('div'));
    });
    self.postMessage({ svg, id });
  } catch (err) {
    self.postMessage({ error: err.message, id });
  }
}; 