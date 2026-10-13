/**
 * Serves the static site and the visitor counter API, and leaves Matrix
 * traffic alone.
 *
 * The Worker runs on the route `rustbuilderz.xyz/*` in front of the existing
 * origin (the Cloudflare tunnel to the homeserver). Wrangler only invokes it
 * for the paths in `assets.run_worker_first`; everything else is answered
 * straight from the static assets. A subrequest from a route Worker to its
 * own zone skips the Worker and reaches the origin, so `fetch(request)` hands
 * Matrix requests to the homeserver unchanged.
 */

import { ensureSchema } from './db';
import type { Env } from './env';
import { failure } from './http';
import { handleViews } from './views';

const ORIGIN_PREFIXES = ['/_matrix/', '/_continuwuity/', '/.well-known/matrix/'];

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  try {
    await ensureSchema(env.DB);
    if (path === '/api/views') return await handleViews(request, env);
    return failure(404, 'not_found', 'Route not found.');
  } catch (error) {
    console.error('api error', path, error);
    return failure(500, 'internal', 'Something went wrong.');
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (ORIGIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return fetch(request);
    }
    if (pathname.startsWith('/api/')) return handleApi(request, env, pathname);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
