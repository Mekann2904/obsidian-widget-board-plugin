import { requestUrl } from "obsidian";
import { Buffer } from "buffer";

// Obsidianプラグイン環境用 CORS回避fetchラッパー
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // ヘッダー初期化
  const headers = options.headers ? { ...options.headers } : {};
  delete (headers as Record<string, string>)["content-length"];

  // リクエストボディの不要項目削除
  if (typeof options.body === "string") {
    try {
      const newBody = JSON.parse(options.body ?? {});
      delete newBody["frequency_penalty"];
      options.body = JSON.stringify(newBody);
    } catch {
      /* ignore malformed JSON */
    }
  }

  // ObsidianのrequestUrl APIを利用
  const method = options.method?.toUpperCase() || "GET";
  const response = await requestUrl({
    url,
    contentType: "application/json",
    headers: headers as Record<string, string>,
    method,
    ...( ["POST", "PUT", "PATCH"].includes(method) && { body: options.body?.toString() }),
    throw: false,
  });

  if (response.status >= 400) {
    let errorJson;
    try {
      errorJson = typeof response.json === "string" ? JSON.parse(response.json) : response.json;
    } catch {
      try {
        errorJson = typeof response.text === "string" ? JSON.parse(response.text) : response.text;
      } catch {
        errorJson = null;
      }
    }
    interface ResponseError extends Error {
      json?: unknown;
    }
    const error: ResponseError = new Error(`Request failed, status ${response.status}`);
    error.json = errorJson;
    throw error;
  }

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.status.toString(),
    headers: new Headers(response.headers),
    url: url,
    type: "basic" as ResponseType,
    redirected: false,
    bytes: () => Promise.resolve(new Uint8Array(0)),
    body: createReadableStreamFromString(response.text),
    bodyUsed: true,
    json: async () => response.json,
    text: async () => response.text,
    arrayBuffer: async () => {
      if (response.arrayBuffer) {
        return response.arrayBuffer;
      }
      const base64 = response.text.replace(/^data:.*;base64,/, "");
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    },
    blob: () => { throw new Error("not implemented"); },
    formData: () => { throw new Error("not implemented"); },
    clone: () => { throw new Error("not implemented"); },
  } as Response;
}

function createReadableStreamFromString(input: string) {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(input);
      controller.enqueue(uint8Array);
      controller.close();
    },
  });
}


