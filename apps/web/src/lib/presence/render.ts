import {
  ActivityType,
  type Activity,
  type DiscordStatus,
  type Presence,
  type Spotify,
} from '@rustbuilderz/presence-protocol';
import { duration } from '../format';
import { badgesFor } from './badges';
import {
  assetUrl,
  avatarUrl,
  bannerUrl,
  createdAt,
  decorationUrl,
  emojiUrl,
  guildTagBadgeUrl,
} from './cdn';

const STATUS_LABEL: Record<DiscordStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Offline',
};

const ACTIVITY_VERB: Record<ActivityType, string> = {
  [ActivityType.Playing]: 'Playing',
  [ActivityType.Streaming]: 'Streaming',
  [ActivityType.Listening]: 'Listening to',
  [ActivityType.Watching]: 'Watching',
  [ActivityType.Custom]: '',
  [ActivityType.Competing]: 'Competing in',
};

const MAX_ACTIVITIES = 3;

function slot<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T | null {
  return root.querySelector<T>(`[data-slot="${name}"]`);
}

function field<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const element = root.querySelector<T>(`[data-field="${name}"]`);
  if (!element) throw new Error(`Template is missing [data-field="${name}"]`);
  return element;
}

function setText(element: HTMLElement, text: string | null | undefined): void {
  element.textContent = text ?? '';
  element.hidden = !text;
}

function setImage(image: HTMLImageElement, src: string | null, alt = ''): void {
  image.hidden = !src;
  image.alt = alt;
  if (src && image.src !== src) image.src = src;
}

function cloneTemplate(root: ParentNode, name: string): HTMLElement {
  const template = root.querySelector<HTMLTemplateElement>(`template[data-template="${name}"]`);
  const element = template?.content.firstElementChild?.cloneNode(true);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing template "${name}"`);
  return element;
}

function platforms(presence: Presence): string {
  const active = [
    presence.active_on_discord_desktop && 'desktop',
    presence.active_on_discord_mobile && 'mobile',
    presence.active_on_discord_web && 'web',
    presence.active_on_discord_embedded && 'console',
  ].filter(Boolean);
  return active.length > 0 ? ` on ${active.join(' & ')}` : '';
}

function renderSpotify(root: ParentNode, spotify: Spotify): HTMLElement {
  const card = cloneTemplate(root, 'spotify');
  const link = field<HTMLAnchorElement>(card, 'link');
  if (spotify.track_id) link.href = `https://open.spotify.com/track/${spotify.track_id}`;
  else link.removeAttribute('href');

  setImage(field<HTMLImageElement>(card, 'art'), spotify.album_art_url, spotify.album);
  setText(field(card, 'song'), spotify.song);
  setText(field(card, 'artist'), spotify.artist.replaceAll(';', ','));
  setText(field(card, 'album'), spotify.album && `on ${spotify.album}`);

  if (spotify.timestamps) {
    card.dataset.start = String(spotify.timestamps.start);
    card.dataset.end = String(spotify.timestamps.end);
  } else {
    field(card, 'progress').hidden = true;
  }
  return card;
}

function renderActivity(root: ParentNode, activity: Activity): HTMLElement {
  const card = cloneTemplate(root, 'activity');
  const large = assetUrl(activity, activity.assets?.large_image);
  const small = assetUrl(activity, activity.assets?.small_image);

  setImage(
    field<HTMLImageElement>(card, 'large'),
    large,
    activity.assets?.large_text ?? activity.name,
  );
  setImage(field<HTMLImageElement>(card, 'small'), small, activity.assets?.small_text ?? '');
  field(card, 'placeholder').hidden = large !== null;

  const verb = ACTIVITY_VERB[activity.type] ?? '';
  setText(field(card, 'kind'), verb);
  setText(field(card, 'name'), activity.name);
  setText(field(card, 'details'), activity.details);
  setText(field(card, 'state'), activity.state);

  const { start, end } = activity.timestamps ?? {};
  if (end !== undefined) card.dataset.end = String(end);
  else if (start !== undefined) card.dataset.start = String(start);
  else field(card, 'time').hidden = true;

  return card;
}

const EMPTY_TEXT: Record<DiscordStatus, string> = {
  online: 'Nothing running right now.',
  idle: 'Away right now.',
  dnd: 'Nothing running right now.',
  offline: 'Offline right now.',
};

const monthYear = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });

function renderProfile(root: HTMLElement, presence: Presence): void {
  const user = presence.discord_user;

  const avatar = slot<HTMLImageElement>(root, 'avatar');
  if (avatar) setImage(avatar, avatarUrl(user), `${user.display_name}'s avatar`);

  const decoration = slot<HTMLImageElement>(root, 'decoration');
  if (decoration) setImage(decoration, decorationUrl(user));

  const banner = slot<HTMLImageElement>(root, 'banner');
  if (banner) setImage(banner, bannerUrl(user));
  // Without a banner image the profile color fills the banner, as on Discord.
  const bannerColor = user.accent_color;
  if (bannerColor != null) {
    root.style.setProperty('--banner-color', `#${bannerColor.toString(16).padStart(6, '0')}`);
  } else {
    root.style.removeProperty('--banner-color');
  }

  const handle = slot(root, 'handle');
  if (handle) {
    const alias = user.display_name !== user.username ? ` · ${user.display_name}` : '';
    setText(handle, `@${user.username}${alias}`);
  }

  const since = slot(root, 'since');
  if (since) setText(since, `on Discord since ${monthYear.format(createdAt(user.id))}`);

  const badges = slot(root, 'badges');
  if (badges) {
    badges.replaceChildren(
      ...badgesFor(user.public_flags).map(({ name, url }) => {
        const image = document.createElement('img');
        image.src = url;
        image.alt = name;
        image.title = name;
        image.width = image.height = 20;
        return image;
      }),
    );
    badges.hidden = badges.childElementCount === 0;
  }

  const tag = slot(root, 'tag');
  const tagText = user.primary_guild?.identity_enabled ? user.primary_guild.tag : null;
  if (tag) {
    tag.hidden = !tagText;
    const tagBadge = slot<HTMLImageElement>(tag, 'tag-badge');
    if (tagBadge) setImage(tagBadge, guildTagBadgeUrl(user));
    const tagLabel = slot(tag, 'tag-text');
    if (tagLabel) tagLabel.textContent = tagText ?? '';
  }
}

function renderCustomStatus(root: HTMLElement, presence: Presence): void {
  const custom = presence.activities.find((activity) => activity.type === ActivityType.Custom);
  const customSlot = slot(root, 'custom-status');
  if (!customSlot) return;

  customSlot.hidden = !custom || (!custom.state && !custom.emoji);
  const emoji = slot<HTMLImageElement>(customSlot, 'custom-emoji');
  const emojiImage = custom?.emoji ? emojiUrl(custom.emoji) : null;
  if (emoji) setImage(emoji, emojiImage, custom?.emoji?.name ?? '');
  const text = slot(customSlot, 'custom-text');
  if (text) {
    // Unicode emoji have no image, so they go in front of the text.
    const prefix = custom?.emoji && !emojiImage ? `${custom.emoji.name} ` : '';
    text.textContent = `${prefix}${custom?.state ?? ''}`.trim();
  }
}

function renderActivities(root: HTMLElement, presence: Presence): void {
  const list = slot(root, 'activities');
  const empty = slot(root, 'now-empty');
  if (!list) return;

  // Status changes alone keep the existing cards, so their entrance animation
  // does not replay and album art does not reload.
  const key = JSON.stringify([presence.spotify, presence.activities]);
  if (list.dataset.key !== key) {
    list.dataset.key = key;

    const cards: HTMLElement[] = [];
    if (presence.spotify) cards.push(renderSpotify(root, presence.spotify));
    for (const activity of presence.activities) {
      if (cards.length >= MAX_ACTIVITIES) break;
      if (activity.type === ActivityType.Custom) continue;
      // Spotify already has its own card.
      if (presence.spotify && activity.party?.id?.startsWith('spotify:')) continue;
      cards.push(renderActivity(root, activity));
    }

    list.replaceChildren(...cards);
    tick(list);
  }

  if (empty)
    setText(empty, list.childElementCount === 0 ? EMPTY_TEXT[presence.discord_status] : '');
}

/** Writes a presence into the page. Cheap to call on every update. */
export function renderPresence(root: HTMLElement, presence: Presence): void {
  const status = presence.discord_status;
  root.dataset.status = status;

  const statusText = slot(root, 'status-text');
  if (statusText) {
    statusText.textContent =
      status === 'offline' ? STATUS_LABEL.offline : `${STATUS_LABEL[status]}${platforms(presence)}`;
  }

  renderProfile(root, presence);
  renderCustomStatus(root, presence);
  renderActivities(root, presence);
}

/** Updates elapsed times and progress bars. Run once a second. */
export function tick(root: ParentNode, now = Date.now()): void {
  for (const card of root.querySelectorAll<HTMLElement>('[data-start], [data-end]')) {
    const start = card.dataset.start ? Number(card.dataset.start) : undefined;
    const end = card.dataset.end ? Number(card.dataset.end) : undefined;
    const time = card.querySelector<HTMLElement>('[data-field="time"]');
    const bar = card.querySelector<HTMLElement>('[data-field="bar"]');

    if (bar && start !== undefined && end !== undefined) {
      const length = end - start;
      const elapsed = Math.min(Math.max(now - start, 0), length);
      bar.style.setProperty('--progress', String(length > 0 ? elapsed / length : 0));
      const elapsedText = card.querySelector<HTMLElement>('[data-field="elapsed"]');
      const totalText = card.querySelector<HTMLElement>('[data-field="total"]');
      if (elapsedText) elapsedText.textContent = duration(elapsed);
      if (totalText) totalText.textContent = duration(length);
    } else if (time && end !== undefined) {
      time.textContent = `${duration(end - now)} left`;
    } else if (time && start !== undefined) {
      time.textContent = `${duration(now - start)} elapsed`;
    }
  }
}
