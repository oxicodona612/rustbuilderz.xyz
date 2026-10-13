import { visitorId } from './db';
import type { Env } from './env';
import { failure, isSameOrigin, json } from './http';

const today = () => new Date().toISOString().slice(0, 10);

function yesterday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function readViews(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT value FROM counters WHERE name = 'views'")
    .first<{ value: number }>();
  return row?.value ?? 0;
}

/**
 * `GET` reads the count. `POST` records a visit: each visitor counts once per
 * UTC day, so reloads and quick returns do not inflate it.
 */
export async function handleViews(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return json({ views: await readViews(env.DB) });
  if (request.method !== 'POST') return failure(405, 'method_not_allowed', 'Use GET or POST.');
  if (!isSameOrigin(request))
    return failure(403, 'forbidden', 'Cross-origin requests are refused.');

  const visitor = await visitorId(env.DB, request, `views:${today()}`);
  const visit = await env.DB.prepare('INSERT OR IGNORE INTO visits (day, visitor) VALUES (?, ?)')
    .bind(today(), visitor)
    .run();

  if (visit.meta.changes === 0) return json({ views: await readViews(env.DB) });

  const [counted] = await env.DB.batch<{ value: number }>([
    env.DB.prepare(
      `INSERT INTO counters (name, value) VALUES ('views', 1)
       ON CONFLICT (name) DO UPDATE SET value = value + 1
       RETURNING value`,
    ),
    // Only today's visitors are needed for deduplication.
    env.DB.prepare('DELETE FROM visits WHERE day < ?').bind(yesterday()),
  ]);
  return json({ views: counted?.results[0]?.value ?? 0 });
}
