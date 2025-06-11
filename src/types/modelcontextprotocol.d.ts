declare module '@modelcontextprotocol/sdk/client' {
  export class Client {
    constructor(opts: { name: string; version: string });
    connect(transport: any): Promise<void>;
    run(options: any): Promise<any>;
  }
}

declare module '@modelcontextprotocol/sdk/client/http' {
  export class HttpClientTransport {
    constructor(opts: { url: string });
  }
}

declare module '@modelcontextprotocol/server-brave-search' {
  export function runServer(opts: { apiKey?: string; port?: number }): Promise<void>;
}
