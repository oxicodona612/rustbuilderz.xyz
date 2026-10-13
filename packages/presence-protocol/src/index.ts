/**
 * Wire format shared by the presence service and the website.
 *
 * The shapes follow Lanyard (https://github.com/Phineas/lanyard), so the
 * website works against either the self-hosted service in `apps/presence`
 * or the public api.lanyard.rest instance.
 */

/** Socket opcodes. */
export const Op = {
  /** Server → client. Carries an event in `t` and its payload in `d`. */
  Event: 0,
  /** Server → client. First message on every connection. */
  Hello: 1,
  /** Client → server. Chooses which users to receive updates for. */
  Initialize: 2,
  /** Client → server. Must be sent every `heartbeat_interval` ms. */
  Heartbeat: 3,
  /** Client → server. Stops updates for some or all users. */
  Unsubscribe: 4,
} as const;
export type Op = (typeof Op)[keyof typeof Op];

/** Close codes used when the server ends a connection. */
export const CloseCode = {
  InvalidPayload: 4001,
  UnknownOpcode: 4002,
  HeartbeatTimeout: 4003,
  TooManyConnections: 4004,
  ShuttingDown: 4005,
} as const;
export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];

/** Discord activity types, as sent by the gateway. */
export const ActivityType = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Custom: 4,
  Competing: 5,
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export type DiscordStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface AvatarDecoration {
  asset: string;
  sku_id?: string;
}

/** The server tag shown next to a user's name. */
export interface PrimaryGuild {
  identity_guild_id: string | null;
  identity_enabled: boolean | null;
  tag: string | null;
  badge: string | null;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  /** `global_name` when set, otherwise `username`. */
  display_name: string;
  discriminator: string;
  avatar: string | null;
  avatar_decoration_data: AvatarDecoration | null;
  public_flags: number;
  bot: boolean;
  /**
   * Profile extras. The self-hosted service fills these in; other
   * Lanyard-compatible APIs may leave them out.
   */
  banner?: string | null;
  /** Profile color as a 24-bit integer. */
  accent_color?: number | null;
  primary_guild?: PrimaryGuild | null;
}

export interface ActivityTimestamps {
  start?: number;
  end?: number;
}

export interface ActivityAssets {
  large_image?: string;
  large_text?: string;
  small_image?: string;
  small_text?: string;
}

export interface ActivityEmoji {
  name: string;
  id?: string;
  animated?: boolean;
}

export interface ActivityParty {
  id?: string;
  size?: [current: number, max: number];
}

/** A Discord activity, passed through from the gateway unchanged. */
export interface Activity {
  id?: string;
  name: string;
  type: ActivityType;
  url?: string | null;
  created_at?: number;
  timestamps?: ActivityTimestamps;
  application_id?: string;
  details?: string | null;
  state?: string | null;
  emoji?: ActivityEmoji | null;
  party?: ActivityParty;
  assets?: ActivityAssets;
  sync_id?: string;
  session_id?: string;
  flags?: number;
  buttons?: string[];
}

export interface Spotify {
  track_id: string | null;
  timestamps: { start: number; end: number } | null;
  song: string;
  artist: string;
  album: string;
  album_art_url: string | null;
}

export interface Presence {
  discord_user: DiscordUser;
  discord_status: DiscordStatus;
  activities: Activity[];
  active_on_discord_desktop: boolean;
  active_on_discord_mobile: boolean;
  active_on_discord_web: boolean;
  active_on_discord_embedded: boolean;
  listening_to_spotify: boolean;
  spotify: Spotify | null;
  kv: Record<string, string>;
}

export type RestResponse =
  { success: true; data: Presence } | { success: false; error: { code: string; message: string } };

/* ------------------------------ client → server ----------------------------- */

export type InitializeData =
  { subscribe_to_id: string } | { subscribe_to_ids: string[] } | { subscribe_to_all: true };

export type UnsubscribeData =
  | { unsubscribe_from_id: string }
  | { unsubscribe_from_ids: string[] }
  | { unsubscribe_from_all: true };

export type ClientMessage =
  | { op: typeof Op.Initialize; d: InitializeData }
  | { op: typeof Op.Heartbeat; d?: null }
  | { op: typeof Op.Unsubscribe; d: UnsubscribeData };

/* ------------------------------ server → client ----------------------------- */

export interface HelloMessage {
  op: typeof Op.Hello;
  d: { heartbeat_interval: number };
}

/**
 * `INIT_STATE` carries a single presence when the client subscribed with
 * `subscribe_to_id`, and a map keyed by user ID otherwise.
 */
export interface InitStateEvent {
  op: typeof Op.Event;
  seq: number;
  t: 'INIT_STATE';
  d: Presence | Record<string, Presence>;
}

/** `user_id` is included when the client subscribed to more than one user. */
export interface PresenceUpdateEvent {
  op: typeof Op.Event;
  seq: number;
  t: 'PRESENCE_UPDATE';
  d: Presence & { user_id?: string };
}

export type ServerMessage = HelloMessage | InitStateEvent | PresenceUpdateEvent;
