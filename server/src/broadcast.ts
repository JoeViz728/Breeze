import { WebSocket } from 'ws';

type BroadcastFn = (data: { type: string; payload?: unknown }, exclude?: WebSocket) => void;

let broadcastFn: BroadcastFn | null = null;

export function setBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

export function broadcast(data: { type: string; payload?: unknown }, exclude?: WebSocket) {
  broadcastFn?.(data, exclude);
}