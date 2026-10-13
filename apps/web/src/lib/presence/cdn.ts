import type { Activity, ActivityEmoji, DiscordUser } from '@rustbuilderz/presence-protocol';

const CDN = 'https://cdn.discordapp.com';

export function avatarUrl(user: DiscordUser, size = 256): string {
  if (!user.avatar) {
    // Users on the new username system get one of six defaults, picked from their ID.
    const index = Number((BigInt(user.id) >> 22n) % 6n);
    return `${CDN}/embed/avatars/${index}.png`;
  }
  const extension = user.avatar.startsWith('a_') ? 'gif' : 'webp';
  return `${CDN}/avatars/${user.id}/${user.avatar}.${extension}?size=${size}`;
}

export function decorationUrl(user: DiscordUser): string | null {
  const asset = user.avatar_decoration_data?.asset;
  // `passthrough` keeps the animation in the returned APNG.
  return asset ? `${CDN}/avatar-decoration-presets/${asset}.png?size=240&passthrough=true` : null;
}

export function bannerUrl(user: DiscordUser, size = 1024): string | null {
  if (!user.banner) return null;
  const extension = user.banner.startsWith('a_') ? 'gif' : 'webp';
  return `${CDN}/banners/${user.id}/${user.banner}.${extension}?size=${size}`;
}

/** The small icon in a server tag, or null when the user shows no tag. */
export function guildTagBadgeUrl(user: DiscordUser): string | null {
  const guild = user.primary_guild;
  if (!guild?.identity_enabled || !guild.identity_guild_id || !guild.badge) return null;
  return `${CDN}/guild-tag-badges/${guild.identity_guild_id}/${guild.badge}.png?size=32`;
}

/** Discord IDs encode their creation time: milliseconds since 2015 in the top 42 bits. */
export function createdAt(id: string): Date {
  return new Date(Number((BigInt(id) >> 22n) + 1_420_070_400_000n));
}

export function emojiUrl(emoji: ActivityEmoji): string | null {
  if (!emoji.id) return null;
  return `${CDN}/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=48`;
}

/** Resolves the image keys used in activity assets to URLs. */
export function assetUrl(activity: Activity, key: string | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('mp:')) return `https://media.discordapp.net/${key.slice(3)}`;
  if (key.startsWith('spotify:')) return `https://i.scdn.co/image/${key.slice(8)}`;
  if (key.startsWith('youtube:')) return `https://i.ytimg.com/vi/${key.slice(8)}/hqdefault.jpg`;
  if (/^\d+$/.test(key) && activity.application_id) {
    return `${CDN}/app-assets/${activity.application_id}/${key}.png?size=160`;
  }
  return null;
}
