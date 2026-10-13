import { writeFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';

interface HeadersOptions {
  /** Origins the page may connect to, besides itself. */
  connect: string[];
  /** Origins the page may load images from, besides itself. */
  images: string[];
}

/** `https://host` → `https://host wss://host`, so REST and socket share one entry. */
function withSocket(origin: string): string[] {
  const { protocol, host } = new URL(origin);
  return protocol === 'https:'
    ? [`https://${host}`, `wss://${host}`]
    : [`http://${host}`, `ws://${host}`];
}

/**
 * Writes a Cloudflare `_headers` file after the build. The CSP is generated so
 * it always matches the presence API and homeserver set in the site config.
 */
export function securityHeaders({ connect, images }: HeadersOptions): AstroIntegration {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    `img-src 'self' data: ${images.join(' ')}`,
    `connect-src 'self' ${[...new Set(connect.flatMap(withSocket))].join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');

  const file = `/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;

  return {
    name: 'security-headers',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        await writeFile(new URL('_headers', dir), file);
        logger.info('wrote _headers');
      },
    },
  };
}
