/**
 * Serves the static site and a small API (visitor counter, live GitHub data),
 * and leaves Matrix and Orchard traffic alone.
 *
 * The Worker runs on the route `rustbuilderz.xyz/*` in front of the existing
 * origin (the Cloudflare tunnel to the homeserver). Wrangler only invokes it
 * for the paths in `assets.run_worker_first`; everything else is answered
 * straight from the static assets. A subrequest from a route Worker to its
 * own zone skips the Worker and reaches the origin, so `fetch(request)` hands
 * Matrix requests to the homeserver unchanged. Caddy on the homeserver sends
 * `/orchard` to Orchard's download site and everything else to Continuwuity.
 */

import { ensureSchema } from './db';
import type { Env } from './env';
import { handleGitHub } from './github';
import { failure } from './http';
import { handleViews } from './views';

const ORIGIN_PREFIXES = ['/_matrix/', '/_continuwuity/', '/.well-known/matrix/', '/orchard/'];
const ORIGIN_PATHS = ['/orchard'];

async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
): Promise<Response> {
  try {
    await ensureSchema(env.DB);
    if (path === '/api/views') return await handleViews(request, env);
    if (path === '/api/github') return await handleGitHub(request, env, ctx);
    return failure(404, 'not_found', 'Route not found.');
  } catch (error) {
    console.error('api error', path, error);
    return failure(500, 'internal', 'Something went wrong.');
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (
      ORIGIN_PATHS.includes(pathname) ||
      ORIGIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ) {
      return fetch(request);
    }
    if (pathname.startsWith('/api/')) return handleApi(request, env, ctx, pathname);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
