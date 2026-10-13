import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { PresenceUpdateStatus, type APIUser } from '@discordjs/core';
import {
  CloseCode,
  Op,
  type InitStateEvent,
  type Presence,
  type PresenceUpdateEvent,
  type ServerMessage,
} from '@rustbuilderz/presence-protocol';
import { silentLogger } from './logger.ts';
import { createPresenceServer, type PresenceServer } from './server.ts';
import { PresenceStore } from './store.ts';

const TRACKED = '123456789012345678';
const OTHER = '876543210987654321';

const user = {
  id: TRACKED,
  username: 'rustbuilderz',
  global_name: 'rustbuilderz',
  discriminator: '0',
  avatar: null,
} as APIUser;

function expectEvent<T extends 'INIT_STATE' | 'PRESENCE_UPDATE'>(
  message: ServerMessage,
  type: T,
): T extends 'INIT_STATE' ? InitStateEvent : PresenceUpdateEvent {
  assert.equal(message.op, Op.Event);
  assert.equal(message.op === Op.Event && message.t, type);
  return message as never;
}

/** Buffers every message so none is lost between awaits. */
class TestClient {
  readonly socket: WebSocket;
  readonly #queue: ServerMessage[] = [];
  readonly #waiting: ((message: ServerMessage) => void)[] = [];

  constructor(url: string, origin?: string) {
    this.socket = new WebSocket(url, origin ? { origin } : undefined);
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      const resolve = this.#waiting.shift();
      if (resolve) resolve(message);
      else this.#queue.push(message);
    });
  }

  next(): Promise<ServerMessage> {
    const queued = this.#queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  send(message: unknown): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  closed(): Promise<number> {
    return new Promise((resolve) => this.socket.once('close', (code) => resolve(code)));
  }
}

describe('presence server', () => {
  const store = new PresenceStore(new Set([TRACKED]));
  let server: PresenceServer;
  let base: string;

  before(async () => {
    server = createPresenceServer(store, silentLogger, {
      allowedOrigins: new Set(['https://rustbuilderz.xyz']),
      heartbeatIntervalMs: 30_000,
      maxConnections: 10,
      gatewayReady: () => true,
    });
    await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
    const { port } = server.http.address() as AddressInfo;
    base = `127.0.0.1:${port}`;
  });

  after(() => server.close());

  it('answers 503 for a tracked user whose profile is not loaded yet', async () => {
    const response = await fetch(`http://${base}/v1/users/${TRACKED}`);
    assert.equal(response.status, 503);
  });

  it('answers 404 for users that are not monitored', async () => {
    const response = await fetch(`http://${base}/v1/users/${OTHER}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'user_not_monitored', message: 'This user is not monitored.' },
    });
  });

  it('serves the presence over REST with CORS for allowed origins', async () => {
    store.setUser(user);
    const response = await fetch(`http://${base}/v1/users/${TRACKED}`, {
      headers: { origin: 'https://rustbuilderz.xyz' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://rustbuilderz.xyz');
    const body = (await response.json()) as { success: boolean; data: { discord_status: string } };
    assert.equal(body.success, true);
    assert.equal(body.data.discord_status, 'offline');
  });

  it('speaks the Lanyard socket protocol', async () => {
    const client = new TestClient(`ws://${base}/socket`, 'https://rustbuilderz.xyz');

    const hello = await client.next();
    assert.deepEqual(hello, { op: Op.Hello, d: { heartbeat_interval: 30_000 } });

    client.send({ op: Op.Initialize, d: { subscribe_to_id: TRACKED } });
    const init = expectEvent(await client.next(), 'INIT_STATE');
    assert.equal((init.d as Presence).discord_user.id, TRACKED);

    store.setPresence({
      user: { id: TRACKED },
      status: PresenceUpdateStatus.Online,
      activities: [],
      client_status: { desktop: PresenceUpdateStatus.Online },
    });
    const update = expectEvent(await client.next(), 'PRESENCE_UPDATE');
    assert.equal(update.seq, 2);
    assert.equal(update.d.discord_status, 'online');
    assert.equal(update.d.user_id, undefined);

    const closed = client.closed();
    client.socket.close();
    await closed;
  });

  it('includes user_id on updates for multi-user subscriptions', async () => {
    const client = new TestClient(`ws://${base}/socket`);
    await client.next();
    client.send({ op: Op.Initialize, d: { subscribe_to_ids: [TRACKED, OTHER] } });

    const init = expectEvent(await client.next(), 'INIT_STATE');
    assert.deepEqual(Object.keys(init.d), [TRACKED]);

    store.setPresence({
      user: { id: TRACKED },
      status: PresenceUpdateStatus.Idle,
      activities: [],
      client_status: {},
    });
    const update = expectEvent(await client.next(), 'PRESENCE_UPDATE');
    assert.equal(update.d.user_id, TRACKED);

    const closed = client.closed();
    client.socket.close();
    await closed;
  });

  it('closes the connection on invalid payloads', async () => {
    const client = new TestClient(`ws://${base}/socket`);
    await client.next();
    const closed = client.closed();
    client.send('not json');
    assert.equal(await closed, CloseCode.InvalidPayload);
  });

  it('closes the connection on unknown opcodes', async () => {
    const client = new TestClient(`ws://${base}/socket`);
    await client.next();
    const closed = client.closed();
    client.send({ op: 42 });
    assert.equal(await closed, CloseCode.UnknownOpcode);
  });

  it('rejects socket upgrades from origins that are not allowed', async () => {
    const socket = new WebSocket(`ws://${base}/socket`, { origin: 'https://evil.example' });
    const status = await new Promise<number | undefined>((resolve) => {
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode));
      socket.on('error', () => resolve(undefined));
    });
    assert.equal(status, 403);
  });
});
