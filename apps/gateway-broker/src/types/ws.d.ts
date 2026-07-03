declare module "ws" {
  import type { IncomingMessage } from "node:http";

  export interface WebSocketOptions {
    readonly perMessageDeflate?: boolean;
    readonly maxPayload?: number;
    readonly headers?: Record<string, string>;
  }

  export interface WebSocketServerOptions {
    readonly port?: number;
    readonly host?: string;
    readonly perMessageDeflate?: boolean;
  }

  export default class WebSocket {
    public static readonly CONNECTING: 0;
    public static readonly OPEN: 1;
    public static readonly CLOSING: 2;
    public static readonly CLOSED: 3;

    public readonly readyState: number;

    public constructor(address: string, options?: WebSocketOptions);

    public on(event: "open", listener: () => void): this;
    public on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    public on(event: "error", listener: (error: Error) => void): this;
    public on(event: "message", listener: (data: Buffer | string) => void): this;
    public once(event: "open", listener: () => void): this;
    public once(event: "close", listener: (code: number, reason: Buffer) => void): this;
    public once(event: "error", listener: (error: Error) => void): this;
    public send(data: string, callback?: (error?: Error) => void): void;
    public close(code?: number, reason?: string): void;
    public terminate(): void;
  }

  export class WebSocketServer {
    public constructor(options: WebSocketServerOptions);

    public readonly options: WebSocketServerOptions;

    public on(
      event: "connection",
      listener: (socket: WebSocket, request: IncomingMessage) => void
    ): this;
    public on(event: "listening", listener: () => void): this;
    public close(callback?: (error?: Error) => void): void;
    public address():
      | { readonly port: number; readonly address: string; readonly family: string }
      | string
      | null;
  }
}
