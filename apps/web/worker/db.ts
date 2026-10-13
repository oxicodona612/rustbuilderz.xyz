/**
 * The schema is small enough to create on first use, which keeps deploys to
 * a single `wrangler deploy` with no migration step.
 */
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL,
    visitor TEXT NOT NULL,
    PRIMARY KEY (day, visitor)
  )`,
];

let schema: Promise<void> | undefined;
let salt: Promise<string> | undefined;

/** Runs once per Worker instance. A failed attempt is retried on the next request. */
export function ensureSchema(db: D1Database): Promise<void> {
  schema ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(
    () => undefined,
    (error: unknown) => {
      schema = undefined;
      throw error;
    },
  );
  return schema;
}

function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * A random secret created on first use and kept in the database. Visitor IDs
 * are hashed with it, so stored IDs cannot be turned back into IP addresses.
 */
function visitorSalt(db: D1Database): Promise<string> {
  salt ??= (async () => {
    await db
      .prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
      .bind('visitor_salt', randomHex(32))
      .run();
    const row = await db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .bind('visitor_salt')
      .first<{ value: string }>();
    if (!row) throw new Error('visitor salt missing');
    return row.value;
  })().catch((error: unknown) => {
    salt = undefined;
    throw error;
  });
  return salt;
}

/** A salted hash of the visitor's IP. `scope` keeps IDs from different features unrelated. */
export async function visitorId(db: D1Database, request: Request, scope: string): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const input = new TextEncoder().encode(`${await visitorSalt(db)}:${scope}:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
