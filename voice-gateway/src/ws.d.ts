// 本地声明：@types/ws 因本机 node_modules 写保护无法安装，这里最小声明覆盖网关用法。
declare module "ws" {
  import { EventEmitter } from "events";
  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    readyState: number;
    constructor(address: string, options?: { headers?: Record<string, string> });
    send(data: string | Buffer | ArrayBuffer | Buffer[]): void;
    close(): void;
    on(event: "open", cb: () => void): this;
    on(event: "message", cb: (data: RawData) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    on(event: "close", cb: () => void): this;
    on(event: "unexpected-response", cb: (req: unknown, res: { statusCode?: number }) => void): this;
  }
  type RawData = Buffer | ArrayBuffer | Buffer[];
  class WebSocketServer extends EventEmitter {
    constructor(options: { port: number });
    on(event: "connection", cb: (ws: WebSocket) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    close(): void;
  }
  export = WebSocket;
  export { WebSocketServer, RawData };
}
