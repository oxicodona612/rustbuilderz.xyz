import {
  Op,
  type Presence,
  type RestResponse,
  type ServerMessage,
} from '@rustbuilderz/presence-protocol';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

export interface PresenceClientOptions {
  /** Base URL of a Lanyard-compatible API, e.g. `https://api.lanyard.rest`. */
  api: string;
  userId: string;
  onPresence(presence: Presence): void;
  onState?(state: ConnectionState): void;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

async function fetchPresence(api: string, userId: string): Promise<Presence | null> {
  try {
    const response = await fetch(`${api}/v1/users/${userId}`, { cache: 'no-store' });
    const body = (await response.json()) as RestResponse;
    return body.success ? body.data : null;
  } catch {
    return null;
  }
}

/**
 * Streams one user's presence over the Lanyard socket protocol and keeps
 * reconnecting with backoff. A REST fetch paints the first frame and covers
 * the gaps while the socket is down. Returns a function that stops everything.
 */
export function connectPresence({ api, userId, onPresence, onState }: PresenceClientOptions) {
  const socketUrl = `${api.replace(/^http/, 'ws')}/socket`;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let stopped = false;

  const refresh = () =>
    fetchPresence(api, userId).then((presence) => {
      if (presence && !stopped) onPresence(presence);
    });

  const scheduleReconnect = () => {
    if (stopped) return;
    onState?.('reconnecting');
    const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** failures);
    failures += 1;
    retry = setTimeout(open, backoff / 2 + Math.random() * (backoff / 2));
    void refresh();
  };

  const handle = (message: ServerMessage) => {
    if (message.op === Op.Hello) {
      socket?.send(JSON.stringify({ op: Op.Initialize, d: { subscribe_to_id: userId } }));
      clearInterval(heartbeat);
      heartbeat = setInterval(
        () => socket?.send(JSON.stringify({ op: Op.Heartbeat })),
        message.d.heartbeat_interval,
      );
      return;
    }

    if (message.t === 'INIT_STATE') {
      failures = 0;
      onState?.('live');
      // A single subscription gets the presence itself; anything else is a map.
      const presence = 'discord_user' in message.d ? (message.d as Presence) : message.d[userId];
      if (presence) onPresence(presence);
      return;
    }

    onPresence(message.d);
  };

  function open() {
    if (stopped) return;
    socket = new WebSocket(socketUrl);
    socket.addEventListener('message', (event) => {
      try {
        handle(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        socket?.close();
      }
    });
    socket.addEventListener('close', () => {
      clearInterval(heartbeat);
      socket = null;
      scheduleReconnect();
    });
  }

  onState?.('connecting');
  void refresh();
  open();

  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.close();
  };
}
