/**
 * Minimal typings for `timesync` 1.0.11 (ships none), covering only what TimesyncClock uses.
 * Shapes mirror lib/timesync.js of that version.
 */
declare module 'timesync' {
  export interface TimeSyncOptions {
    /** Single-server mode: any truthy id; `send` receives it as `to`. */
    server?: string;
    /** Auto-sync interval in ms; null disables automatic syncing. */
    interval?: number | null;
    timeout?: number;
    delay?: number;
    repeat?: number;
    now?: () => number;
  }

  /** JSON-RPC request; the index signature matches the contract's loose (extra fields allowed) schema. */
  export interface TimeSyncRequest {
    readonly [field: string]: unknown;
    readonly jsonrpc: '2.0';
    readonly id: number;
    readonly method: 'timesync';
  }

  export interface TimeSync {
    /** Must deliver `data` to the server and resolve once `receive` was called with the reply. */
    send: (to: string, data: TimeSyncRequest, timeout: number) => Promise<void>;
    receive(from: string | undefined, data: unknown): void;
    now(): number;
    readonly offset: number;
    on(event: 'change', callback: (offset: number) => void): TimeSync;
    on(event: 'error', callback: (error: unknown) => void): TimeSync;
    on(event: 'sync', callback: (state: 'start' | 'end') => void): TimeSync;
    sync(): Promise<void>;
    destroy(): void;
  }

  export function create(options?: TimeSyncOptions): TimeSync;
}
