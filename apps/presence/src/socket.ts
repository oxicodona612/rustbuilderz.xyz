import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  CloseCode,
  Op,
  type ClientMessage,
  type InitializeData,
  type Presence,
  type ServerMessage,
  type UnsubscribeData,
} from '@rustbuilderz/presence-protocol';
import type { Logger } from './logger.ts';
import type { PresenceStore } from './store.ts';

export interface SocketOptions {
  heartbeatIntervalMs: number;
  maxConnections: number;
}

type Subscription =
  | { mode: 'none' }
  | { mode: 'single'; userId: string }
  | { mode: 'many'; userIds: ReadonlySet<string> }
  | { mode: 'all' };

interface Connection {
  socket: WebSocket;
  subscription: Subscription;
  seq: number;
  lastHeartbeat: number;
}

/** Hidden browser tabs may only fire timers once a minute, so allow a few missed beats. */
const HEARTBEAT_TOLERANCE = 3;
const MAX_IDS_PER_MESSAGE = 100;

const UNKNOWN_OPCODE = Symbol('unknown opcode');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_IDS_PER_MESSAGE &&
    value.every((id) => typeof id === 'string')
  );
}

function parseInitialize(d: Record<string, unknown>): InitializeData | null {
  if (typeof d.subscribe_to_id === 'string') return { subscribe_to_id: d.subscribe_to_id };
  if (isIdList(d.subscribe_to_ids)) return { subscribe_to_ids: d.subscribe_to_ids };
  if (d.subscribe_to_all === true) return { subscribe_to_all: true };
  return null;
}

function parseUnsubscribe(d: Record<string, unknown>): UnsubscribeData | null {
  if (typeof d.unsubscribe_from_id === 'string')
    return { unsubscribe_from_id: d.unsubscribe_from_id };
  if (isIdList(d.unsubscribe_from_ids)) return { unsubscribe_from_ids: d.unsubscribe_from_ids };
  if (d.unsubscribe_from_all === true) return { unsubscribe_from_all: true };
  return null;
}

/** Returns `null` for malformed input and `UNKNOWN_OPCODE` for well-formed input with an unknown `op`. */
function parse(raw: RawData): ClientMessage | typeof UNKNOWN_OPCODE | null {
  let message: unknown;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return null;
  }
  if (!isRecord(message) || typeof message.op !== 'number') return null;

  const { op, d } = message;
  switch (op) {
    case Op.Heartbeat:
      return { op };
    case Op.Initialize: {
      const data = isRecord(d) ? parseInitialize(d) : null;
      return data && { op, d: data };
    }
    case Op.Unsubscribe: {
      const data = isRecord(d) ? parseUnsubscribe(d) : null;
      return data && { op, d: data };
    }
    default:
      return UNKNOWN_OPCODE;
  }
}

function toSubscription(data: InitializeData): Subscription {
  if ('subscribe_to_all' in data) return { mode: 'all' };
  if ('subscribe_to_id' in data) return { mode: 'single', userId: data.subscribe_to_id };
  return { mode: 'many', userIds: new Set(data.subscribe_to_ids) };
}

function subscribes(subscription: Subscription, userId: string): boolean {
  switch (subscription.mode) {
    case 'none':
      return false;
    case 'single':
      return subscription.userId === userId;
    case 'many':
      return subscription.userIds.has(userId);
    case 'all':
      return true;
  }
}

/**
 * Serves the Lanyard socket protocol: Hello → Initialize → INIT_STATE, then
 * PRESENCE_UPDATE events for as long as the client keeps heartbeating.
 */
export class PresenceSocketServer {
  readonly #store: PresenceStore;
  readonly #logger: Logger;
  readonly #options: SocketOptions;
  readonly #server = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  readonly #connections = new Set<Connection>();
  readonly #sweep: NodeJS.Timeout;
  readonly #onUpdate = (userId: string, presence: Presence) => this.#broadcast(userId, presence);

  constructor(store: PresenceStore, logger: Logger, options: SocketOptions) {
    this.#store = store;
    this.#logger = logger;
    this.#options = options;
    this.#store.on('update', this.#onUpdate);
    this.#sweep = setInterval(() => this.#closeStale(), options.heartbeatIntervalMs / 2);
    this.#sweep.unref();
  }

  get size(): number {
    return this.#connections.size;
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#server.handleUpgrade(request, socket, head, (ws) => this.#accept(ws));
  }

  close(): void {
    clearInterval(this.#sweep);
    this.#store.off('update', this.#onUpdate);
    for (const { socket } of this.#connections)
      socket.close(CloseCode.ShuttingDown, 'shutting down');
    this.#connections.clear();
    this.#server.close();
  }

  #accept(socket: WebSocket): void {
    if (this.#connections.size >= this.#options.maxConnections) {
      socket.close(CloseCode.TooManyConnections, 'too many connections');
      return;
    }

    const connection: Connection = {
      socket,
      subscription: { mode: 'none' },
      seq: 0,
      lastHeartbeat: Date.now(),
    };
    this.#connections.add(connection);

    socket.on('message', (raw) => this.#receive(connection, raw));
    socket.on('close', () => this.#connections.delete(connection));
    socket.on('error', (error) => this.#logger.debug('socket error', { error }));

    this.#send(connection, {
      op: Op.Hello,
      d: { heartbeat_interval: this.#options.heartbeatIntervalMs },
    });
  }

  #receive(connection: Connection, raw: RawData): void {
    const message = parse(raw);
    if (message === null) {
      connection.socket.close(CloseCode.InvalidPayload, 'invalid payload');
      return;
    }
    if (message === UNKNOWN_OPCODE) {
      connection.socket.close(CloseCode.UnknownOpcode, 'unknown opcode');
      return;
    }

    connection.lastHeartbeat = Date.now();

    switch (message.op) {
      case Op.Heartbeat:
        return;
      case Op.Initialize:
        connection.subscription = toSubscription(message.d);
        this.#sendInitialState(connection);
        return;
      case Op.Unsubscribe:
        connection.subscription = this.#unsubscribe(connection.subscription, message.d);
        return;
    }
  }

  #unsubscribe(current: Subscription, data: UnsubscribeData): Subscription {
    if ('unsubscribe_from_all' in data) return { mode: 'none' };

    const removed = new Set(
      'unsubscribe_from_id' in data ? [data.unsubscribe_from_id] : data.unsubscribe_from_ids,
    );
    switch (current.mode) {
      case 'none':
        return current;
      case 'single':
        return removed.has(current.userId) ? { mode: 'none' } : current;
      case 'many':
      case 'all': {
        const userIds = current.mode === 'many' ? current.userIds : this.#store.trackedIds;
        return { mode: 'many', userIds: new Set([...userIds].filter((id) => !removed.has(id))) };
      }
    }
  }

  #sendInitialState(connection: Connection): void {
    const { subscription } = connection;
    const d =
      subscription.mode === 'single'
        ? (this.#store.get(subscription.userId) ?? {})
        : Object.fromEntries(
            Object.entries(this.#store.all()).filter(([id]) => subscribes(subscription, id)),
          );

    this.#send(connection, { op: Op.Event, seq: ++connection.seq, t: 'INIT_STATE', d });
  }

  #broadcast(userId: string, presence: Presence): void {
    for (const connection of this.#connections) {
      const { subscription } = connection;
      if (!subscribes(subscription, userId)) continue;

      const d = subscription.mode === 'single' ? presence : { ...presence, user_id: userId };
      this.#send(connection, { op: Op.Event, seq: ++connection.seq, t: 'PRESENCE_UPDATE', d });
    }
  }

  #closeStale(): void {
    const deadline = Date.now() - this.#options.heartbeatIntervalMs * HEARTBEAT_TOLERANCE;
    for (const connection of this.#connections) {
      if (connection.lastHeartbeat < deadline) {
        connection.socket.close(CloseCode.HeartbeatTimeout, 'heartbeat timeout');
        this.#connections.delete(connection);
      }
    }
  }

  #send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  }
}
