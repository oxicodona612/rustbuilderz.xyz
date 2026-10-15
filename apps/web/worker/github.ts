import { fetchSnapshot, type GitHubSnapshot } from '../src/lib/github';
import { site } from '../src/site.config';
import type { Env } from './env';
import { failure, json } from './http';

/**
 * `GET /api/github`: the GitHub tiles' data, kept current between builds.
 *
 * The last good copy lives in D1, so every Cloudflare location shares it and
 * GitHub sees at most one refresh per window, whatever the traffic.
 */

const FRESH_FOR_MS = 10 * 60_000;
const STORE_KEY = 'github_snapshot';
const HEADERS = { 'cache-control': 'public, max-age=60' };

/** One refresh at a time per Worker instance. */
let refreshing: Promise<GitHubSnapshot | null> | undefined;

async function readStored(db: D1Database): Promise<GitHubSnapshot | null> {
  const row = await db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .bind(STORE_KEY)
    .first<{ value: string }>();
  return row ? (JSON.parse(row.value) as GitHubSnapshot) : null;
}

/**
 * Fetches a new snapshot and stores it. Parts that fail keep their previous
 * value, so a GitHub hiccup never blanks a tile.
 */
function refresh(env: Env, previous: GitHubSnapshot | null): Promise<GitHubSnapshot | null> {
  refreshing ??= (async () => {
    const fresh = await fetchSnapshot(site.github.username, { token: env.GITHUB_TOKEN });
    const merged: GitHubSnapshot = {
      contributions: fresh.contributions ?? previous?.contributions ?? null,
      commits: fresh.commits.length > 0 ? fresh.commits : (previous?.commits ?? []),
      fetchedAt: fresh.fetchedAt,
    };
    if (!merged.contributions && merged.commits.length === 0) return null;

    await env.DB.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    )
      .bind(STORE_KEY, JSON.stringify(merged))
      .run();
    return merged;
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

export async function handleGitHub(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'GET') return failure(405, 'method_not_allowed', 'Use GET.');

  const stored = await readStored(env.DB);
  const age = stored ? Date.now() - Date.parse(stored.fetchedAt) : Infinity;

  if (stored && age < FRESH_FOR_MS) return json(stored, 200, HEADERS);

  if (stored) {
    // Stale: answer right away and refresh in the background.
    ctx.waitUntil(refresh(env, stored).catch((error: unknown) => console.error(error)));
    return json(stored, 200, HEADERS);
  }

  const fresh = await refresh(env, null);
  return fresh
    ? json(fresh, 200, HEADERS)
    : failure(502, 'unavailable', 'GitHub data is unavailable right now.');
}
