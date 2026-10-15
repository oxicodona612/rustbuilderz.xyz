---
name: rustbuilderz.xyz
repo: oxicodona612/rustbuilderz.xyz
summary: This site, plus a self-hosted, Lanyard-compatible Discord presence API.
tags: [Astro, Cloudflare Workers, Discord, WebSocket]
order: 3
---

- Static Astro site on Cloudflare Workers. Matrix traffic for the domain passes through to the homeserver.
- Live Discord status, Spotify and activities, streamed from a small Node service over WebSocket.
- Speaks the Lanyard protocol, so it also works against the public Lanyard API.
