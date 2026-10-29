# rustbuilderz.xyz

[![CI](https://github.com/oxicodona612/rustbuilderz.xyz/actions/workflows/ci.yml/badge.svg)](https://github.com/oxicodona612/rustbuilderz.xyz/actions/workflows/ci.yml)

The source of [rustbuilderz.xyz](https://rustbuilderz.xyz),

## What's running

- **The site** is a static Astro build served by a Cloudflare Worker. My Matrix homeserver lives on the same domain, so the Worker passes Matrix traffic straight through to it.
- **The page is a bento grid** of tiles: profile, what I'm doing now, local time, visitors, links, GitHub activity, projects, latest commits, about.
- **The live Discord status** comes from my own presence service. A Discord bot sees my status, and the service streams it to the page over WebSocket using the [Lanyard](https://github.com/Phineas/lanyard) protocol. It also supplies my banner, profile color, badges and server tag.
- **GitHub activity** (the contribution heatmap, streaks and latest commits) is built into the page, then refreshed in the browser from the Worker's `/api/github`. The Worker keeps a copy in D1 that is at most ten minutes old, so new commits show up without a rebuild. Project stats come from the build, and a daily rebuild keeps them current.
- **The visitor counter** counts each visitor once a day. Visitors are recognized by a salted hash in Cloudflare D1, and IP addresses are never stored.
- **Little JavaScript and a strict Content-Security-Policy.** The page has no inline scripts or styles, and the policy is generated from the site config at build time.

## How requests flow

```
rustbuilderz.xyz ────────────▶ Cloudflare Worker ──▶ static site
  ├─ /api/views, /api/github ──▶ Cloudflare Worker ──▶ D1 (and GitHub, every 10 min)
  ├─ /_matrix/*, /.well-known/matrix/* ──▶ Cloudflare tunnel ──▶ Caddy ──▶ Continuwuity
  └─ /orchard, /orchard/* ─────────────▶ Cloudflare tunnel ──▶ Caddy ──▶ Orchard site

presence.rustbuilderz.xyz ───▶ Cloudflare tunnel ──▶ presence service ◀── Discord gateway
```

## Layout

```
.
├── apps/
│   ├── web/                    The site and the Worker that serves it
│   │   ├── src/
│   │   │   ├── site.config.ts  Name, links, taglines and presence settings
│   │   │   ├── content/        Projects, one Markdown file each
│   │   │   ├── components/     Tile wrapper and project cards
│   │   │   │   └── tiles/      One component per bento tile
│   │   │   ├── lib/            GitHub data, presence client and renderer
│   │   │   └── scripts/        Background particles and small interactions
│   │   ├── integrations/       Build step that writes the security headers
│   │   ├── worker/             Matrix passthrough, visitor counter, live GitHub data
│   │   └── wrangler.jsonc
│   └── presence/               Discord presence service (REST and WebSocket)
├── packages/
│   └── presence-protocol/      Wire types shared by the site and the service
└── .github/workflows/          CI and site deploys
```

## Stack

| Part     | Tools                                                  |
| -------- | ------------------------------------------------------ |
| Site     | Astro, TypeScript, hand-written CSS, Geist             |
| Hosting  | Cloudflare Workers, D1, Cloudflare Tunnel              |
| Presence | Node.js, `@discordjs/core`, `ws`, Docker               |
| Tooling  | pnpm workspaces, `node:test`, Prettier, GitHub Actions |

## Deployment

- **Site:** pushes to `main` that touch the site run the deploy workflow: it type checks, builds, and publishes with Wrangler. The D1 database is created on the first deploy, and its tables on first use. A daily run refreshes the build-time GitHub data. The Worker can use an optional `GITHUB_TOKEN` secret for GitHub's higher rate limit. CI checks every push and pull request on its own.
- **Presence service:** runs in Docker on a home server and is reachable only through the tunnel. Details in [`apps/presence`](apps/presence/README.md).

## Running it locally

Needs Node.js 22.18+ and pnpm 11.

```sh
pnpm install
pnpm dev     # http://localhost:4321, live status included
pnpm --filter @rustbuilderz/web exec wrangler dev   # optional: the /api routes
pnpm check   # type checks
pnpm test    # presence service tests
```

## License

The code is under the [MIT License](LICENSE). The personal content (the about text, project descriptions and avatar) is mine.
