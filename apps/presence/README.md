# Presence service

The service behind the live Discord status on [rustbuilderz.xyz](https://rustbuilderz.xyz). A bot watches presence updates in one Discord server, and the service exposes the tracked users over REST and WebSocket. Its API matches [Lanyard](https://github.com/Phineas/lanyard)'s.

## How it works

1. **`discord.ts`** connects to the Discord gateway as a bot with the `Guilds`, `GuildMembers` and `GuildPresences` intents. When the server loads, it fetches each tracked user's full profile and current presence. After that, every presence, profile and membership change is applied as it arrives. Banner, profile color and server tag changes produce no gateway event, so full profiles are fetched again every 10 minutes.
2. **`store.ts`** keeps the latest state of each tracked user and emits an update only when something visible changed. Discord repeats identical presences often.
3. **`transform.ts`** turns raw gateway data into the public shape. It copies only known activity fields, so activity secrets and anything Discord adds later never leave the service. It also extracts the Spotify track and works out which platforms are active.
4. **`server.ts`** serves REST and the health check, applies CORS from `ALLOWED_ORIGINS`, and hands `/socket` to **`socket.ts`**, which speaks the socket protocol below.

Only users listed in `TRACKED_USER_IDS` are ever served.

## Deployment

It runs from [`compose.yaml`](compose.yaml) on a home server:

- listens on `127.0.0.1:4100` only, with a Cloudflare tunnel publishing it as `presence.rustbuilderz.xyz`
- read-only filesystem and no Linux capabilities
- restarts automatically

The image builds on the host network, because Docker's isolated build network couldn't resolve DNS on that machine.

## Configuration

Read from the environment (see [`.env.example`](.env.example)):

| Variable                | Default   | Description                                            |
| ----------------------- | --------- | ------------------------------------------------------ |
| `DISCORD_TOKEN`         | required  | Bot token                                              |
| `DISCORD_GUILD_ID`      | required  | Server shared by the bot and the tracked users         |
| `TRACKED_USER_IDS`      | required  | Comma-separated user IDs to expose                     |
| `ALLOWED_ORIGINS`       | `*`       | Comma-separated browser origins allowed to use the API |
| `HOST`                  | `0.0.0.0` | Interface to listen on                                 |
| `PORT`                  | `4100`    | Port to listen on                                      |
| `HEARTBEAT_INTERVAL_MS` | `30000`   | Heartbeat interval sent to socket clients              |
| `MAX_CONNECTIONS`       | `1000`    | Socket connections accepted at once                    |
| `LOG_LEVEL`             | `info`    | `debug`, `info`, `warn` or `error`                     |

The `GuildMembers` and `GuildPresences` intents are privileged. Discord refuses the connection unless they're enabled for the bot.

## API

### REST

`GET /v1/users/:id`

```json
{ "success": true, "data": { "discord_user": {}, "discord_status": "online", "activities": [] } }
```

| Status | `error.code`           | Meaning                              |
| ------ | ---------------------- | ------------------------------------ |
| 404    | `user_not_monitored`   | The ID is not in `TRACKED_USER_IDS`  |
| 503    | `presence_unavailable` | The bot has not loaded this user yet |

`GET /healthz` answers `200` once the Discord server has loaded, and `503` before that.

### WebSocket

Connect to `/socket`. The protocol matches Lanyard's:

| Op  | Name        | Direction       | Payload                                                                 |
| --- | ----------- | --------------- | ----------------------------------------------------------------------- |
| 0   | Event       | server → client | `t` is `INIT_STATE` or `PRESENCE_UPDATE`                                |
| 1   | Hello       | server → client | `{ "heartbeat_interval": 30000 }`                                       |
| 2   | Initialize  | client → server | `subscribe_to_id`, `subscribe_to_ids` or `subscribe_to_all`             |
| 3   | Heartbeat   | client → server | none. Sent every `heartbeat_interval` ms                                |
| 4   | Unsubscribe | client → server | `unsubscribe_from_id`, `unsubscribe_from_ids` or `unsubscribe_from_all` |

Besides Lanyard's fields, `discord_user` carries `banner`, `accent_color` and `primary_guild` (the server tag). Lanyard clients ignore them.

With `subscribe_to_id`, `INIT_STATE` carries the presence itself. Otherwise it carries a map keyed by user ID, and every `PRESENCE_UPDATE` includes `user_id`.

| Close code | Reason                           |
| ---------- | -------------------------------- |
| 4001       | Invalid payload                  |
| 4002       | Unknown opcode                   |
| 4003       | No heartbeat for three intervals |
| 4004       | Too many connections             |
| 4005       | Server shutting down             |

## Development

```sh
pnpm dev     # runs src/ with live reload, reads .env
pnpm test    # node:test suite
pnpm build   # bundles to dist/
```
