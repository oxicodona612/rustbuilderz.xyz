import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { RestResponse } from '@rustbuilderz/presence-protocol';
import type { Logger } from './logger.ts';
import { PresenceSocketServer, type SocketOptions } from './socket.ts';
import type { PresenceStore } from './store.ts';

export interface ServerOptions extends SocketOptions {
  allowedOrigins: '*' | ReadonlySet<string>;
  /** Reported by `/healthz`. */
  gatewayReady: () => boolean;
}

export interface PresenceServer {
  http: Server;
  sockets: PresenceSocketServer;
  close(): Promise<void>;
}

const USER_ROUTE = /^\/v1\/users\/(\d{17,20})\/?$/;

function isAllowedOrigin(allowed: ServerOptions['allowedOrigins'], origin: string | undefined) {
  // Requests without an Origin header come from non-browser clients.
  return allowed === '*' || origin === undefined || allowed.has(origin);
}

function corsHeaders(
  allowed: ServerOptions['allowedOrigins'],
  origin: string | undefined,
): Record<string, string> {
  if (allowed === '*') return { 'access-control-allow-origin': '*' };
  if (origin && allowed.has(origin))
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  return { vary: 'Origin' };
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function failure(code: string, message: string): RestResponse {
  return { success: false, error: { code, message } };
}

export function createPresenceServer(
  store: PresenceStore,
  logger: Logger,
  options: ServerOptions,
): PresenceServer {
  const sockets = new PresenceSocketServer(store, logger, options);

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const origin = request.headers.origin;
    const cors = corsHeaders(options.allowedOrigins, origin);
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...cors,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-max-age': '86400',
      });
      response.end();
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, failure('method_not_allowed', 'Only GET is supported.'), {
        ...cors,
        allow: 'GET, OPTIONS',
      });
      return;
    }

    if (pathname === '/healthz') {
      const ready = options.gatewayReady();
      json(response, ready ? 200 : 503, { ok: ready, connections: sockets.size }, cors);
      return;
    }

    const userId = USER_ROUTE.exec(pathname)?.[1];
    if (userId) {
      if (!store.isTracked(userId)) {
        json(response, 404, failure('user_not_monitored', 'This user is not monitored.'), cors);
        return;
      }
      const presence = store.get(userId);
      if (!presence) {
        json(response, 503, failure('presence_unavailable', 'Presence is not loaded yet.'), {
          ...cors,
          'retry-after': '5',
        });
        return;
      }
      json(response, 200, { success: true, data: presence } satisfies RestResponse, cors);
      return;
    }

    json(response, 404, failure('not_found', 'Route not found.'), cors);
  };

  const http = createServer(handle);

  http.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== '/socket') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!isAllowedOrigin(options.allowedOrigins, request.headers.origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head);
  });

  return {
    http,
    sockets,
    close: () =>
      new Promise((resolve, reject) => {
        sockets.close();
        http.close((error) => (error ? reject(error) : resolve()));
        http.closeAllConnections();
      }),
  };
}
