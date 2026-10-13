import type { APIUser, GatewayActivity, GatewayPresenceClientStatus } from '@discordjs/core';
import type {
  Activity,
  ActivityType,
  DiscordStatus,
  DiscordUser,
  Presence,
  Spotify,
} from '@rustbuilderz/presence-protocol';

/** The parts of a gateway presence the service keeps between updates. */
export interface PresenceState {
  status: DiscordStatus;
  activities: GatewayActivity[];
  clientStatus: GatewayPresenceClientStatus;
}

export const OFFLINE: PresenceState = { status: 'offline', activities: [], clientStatus: {} };

/**
 * Builds the public user. Banner, profile color and server tag only come
 * with a full user lookup, so when `user` lacks them the values from
 * `previous` are kept instead of being cleared.
 */
export function toDiscordUser(user: APIUser, previous?: DiscordUser): DiscordUser {
  const decoration =
    user.avatar_decoration_data === undefined
      ? (previous?.avatar_decoration_data ?? null)
      : user.avatar_decoration_data && {
          asset: user.avatar_decoration_data.asset,
          sku_id: user.avatar_decoration_data.sku_id,
        };
  const guild =
    user.primary_guild === undefined
      ? (previous?.primary_guild ?? null)
      : user.primary_guild && {
          identity_guild_id: user.primary_guild.identity_guild_id,
          identity_enabled: user.primary_guild.identity_enabled,
          tag: user.primary_guild.tag,
          badge: user.primary_guild.badge,
        };

  return {
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    display_name: user.global_name ?? user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    avatar_decoration_data: decoration,
    public_flags: user.public_flags ?? previous?.public_flags ?? 0,
    bot: user.bot ?? false,
    banner: user.banner === undefined ? (previous?.banner ?? null) : user.banner,
    accent_color:
      user.accent_color === undefined ? (previous?.accent_color ?? null) : user.accent_color,
    primary_guild: guild,
  };
}

/**
 * Copies the public fields of an activity. Secrets and anything Discord adds
 * later are left out, so new gateway fields never leak by accident.
 */
export function toActivity(activity: GatewayActivity): Activity {
  return {
    id: activity.id,
    name: activity.name,
    // discord-api-types models this as an enum with the same numeric values.
    type: activity.type as number as ActivityType,
    url: activity.url,
    created_at: activity.created_at,
    timestamps: activity.timestamps,
    application_id: activity.application_id,
    details: activity.details,
    state: activity.state,
    emoji: activity.emoji
      ? {
          name: activity.emoji.name ?? '',
          id: activity.emoji.id ?? undefined,
          animated: activity.emoji.animated,
        }
      : undefined,
    party: activity.party,
    assets: activity.assets && {
      large_image: activity.assets.large_image,
      large_text: activity.assets.large_text,
      small_image: activity.assets.small_image,
      small_text: activity.assets.small_text,
    },
    sync_id: activity.sync_id,
    session_id: activity.session_id,
    flags: activity.flags,
    buttons: activity.buttons?.map((button) =>
      typeof button === 'string' ? button : button.label,
    ),
  };
}

function isSpotify(activity: GatewayActivity): boolean {
  return activity.type === 2 && (activity.party?.id?.startsWith('spotify:') ?? false);
}

export function toSpotify(activities: readonly GatewayActivity[]): Spotify | null {
  const activity = activities.find(isSpotify);
  if (!activity) return null;

  const art = activity.assets?.large_image;
  const { start, end } = activity.timestamps ?? {};

  return {
    track_id: activity.sync_id ?? null,
    timestamps: start !== undefined && end !== undefined ? { start, end } : null,
    song: activity.details ?? '',
    artist: activity.state ?? '',
    album: activity.assets?.large_text ?? '',
    album_art_url: art?.startsWith('spotify:')
      ? `https://i.scdn.co/image/${art.slice('spotify:'.length)}`
      : null,
  };
}

export function buildPresence(user: DiscordUser, state: PresenceState): Presence {
  const spotify = toSpotify(state.activities);
  return {
    discord_user: user,
    discord_status: state.status,
    activities: state.activities.map(toActivity),
    active_on_discord_desktop: state.clientStatus.desktop !== undefined,
    active_on_discord_mobile: state.clientStatus.mobile !== undefined,
    active_on_discord_web: state.clientStatus.web !== undefined,
    // Console and embedded clients report as `embedded`, which discord-api-types does not model yet.
    active_on_discord_embedded: 'embedded' in state.clientStatus,
    listening_to_spotify: spotify !== null,
    spotify,
    kv: {},
  };
}
