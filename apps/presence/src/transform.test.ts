import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PresenceUpdateStatus, type APIUser, type GatewayActivity } from '@discordjs/core';
import { buildPresence, toActivity, toDiscordUser, toSpotify } from './transform.ts';

const user = {
  id: '123456789012345678',
  username: 'rustbuilderz',
  global_name: null,
  discriminator: '0',
  avatar: 'a_0123456789abcdef',
  public_flags: 64,
} as APIUser;

const spotify = {
  id: 'spotify:1',
  name: 'Spotify',
  type: 2,
  created_at: 1_700_000_000_000,
  details: 'Song Title',
  state: 'Artist One; Artist Two',
  sync_id: '4uLU6hMCjMI75M1A2tKUQC',
  party: { id: 'spotify:123456789012345678' },
  timestamps: { start: 1_700_000_000_000, end: 1_700_000_200_000 },
  assets: { large_image: 'spotify:ab67616d0000b273abcdef', large_text: 'Album Name' },
} as GatewayActivity;

const game = {
  id: 'abc',
  name: 'Visual Studio Code',
  type: 0,
  created_at: 1_700_000_000_000,
  application_id: '383226320970055681',
  details: 'Editing index.ts',
  secrets: { join: 'should-not-leak' },
  buttons: [{ label: 'View Repository', url: 'https://example.com' }],
} as GatewayActivity;

describe('toDiscordUser', () => {
  it('falls back to the username when there is no global name', () => {
    const result = toDiscordUser(user);
    assert.equal(result.display_name, 'rustbuilderz');
    assert.equal(result.bot, false);
    assert.equal(result.avatar_decoration_data, null);
  });

  it('keeps profile extras when a partial user leaves them out', () => {
    const full = toDiscordUser({
      ...user,
      banner: 'a_banner',
      accent_color: 0x112233,
      primary_guild: { identity_guild_id: '1', identity_enabled: true, tag: 'RUST', badge: 'b' },
    } as APIUser);
    const later = toDiscordUser({ ...user, avatar: 'new_avatar' } as APIUser, full);

    assert.equal(later.avatar, 'new_avatar');
    assert.equal(later.banner, 'a_banner');
    assert.equal(later.accent_color, 0x112233);
    assert.equal(later.primary_guild?.tag, 'RUST');
  });

  it('clears profile extras the user removed', () => {
    const full = toDiscordUser({ ...user, banner: 'a_banner' } as APIUser);
    assert.equal(toDiscordUser({ ...user, banner: null } as APIUser, full).banner, null);
  });
});

describe('toActivity', () => {
  it('drops secrets and flattens buttons to labels', () => {
    const result = toActivity(game);
    assert.equal('secrets' in result, false);
    assert.deepEqual(result.buttons, ['View Repository']);
  });
});

describe('toSpotify', () => {
  it('extracts the track from a Spotify activity', () => {
    assert.deepEqual(toSpotify([game, spotify]), {
      track_id: '4uLU6hMCjMI75M1A2tKUQC',
      timestamps: { start: 1_700_000_000_000, end: 1_700_000_200_000 },
      song: 'Song Title',
      artist: 'Artist One; Artist Two',
      album: 'Album Name',
      album_art_url: 'https://i.scdn.co/image/ab67616d0000b273abcdef',
    });
  });

  it('returns null without a Spotify activity', () => {
    assert.equal(toSpotify([game]), null);
  });
});

describe('buildPresence', () => {
  it('reports the active platforms from the client status', () => {
    const presence = buildPresence(toDiscordUser(user), {
      status: 'dnd',
      activities: [spotify],
      clientStatus: {
        desktop: PresenceUpdateStatus.DoNotDisturb,
        mobile: PresenceUpdateStatus.Idle,
      },
    });
    assert.equal(presence.discord_status, 'dnd');
    assert.equal(presence.active_on_discord_desktop, true);
    assert.equal(presence.active_on_discord_mobile, true);
    assert.equal(presence.active_on_discord_web, false);
    assert.equal(presence.listening_to_spotify, true);
  });
});
