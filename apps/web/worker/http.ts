export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

export function failure(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/**
 * Writes must come from the site itself. Browsers always send `Origin` on
 * POST and DELETE, so a missing or foreign origin is refused.
 */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin;
}
