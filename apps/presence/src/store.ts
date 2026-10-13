import { EventEmitter } from 'node:events';
import type { APIUser, GatewayGuildMembersChunkPresence } from '@discordjs/core';
import type { DiscordUser, Presence } from '@rustbuilderz/presence-protocol';
import { buildPresence, OFFLINE, toDiscordUser, type PresenceState } from './transform.ts';

interface StoreEvents {
  update: [userId: string, presence: Presence];
}

/**
 * Holds the latest presence of every tracked user and emits `update` whenever
 * the public view of one of them changes.
 *
 * A user becomes visible once their profile is known (from the guild member
 * lookup). Presence data that arrives earlier is kept and applied then.
 */
export class PresenceStore extends EventEmitter<StoreEvents> {
  readonly #tracked: ReadonlySet<string>;
  readonly #users = new Map<string, DiscordUser>();
  readonly #states = new Map<string, PresenceState>();
  readonly #snapshots = new Map<string, { presence: Presence; serialized: string }>();

  constructor(tracked: ReadonlySet<string>) {
    super();
    this.#tracked = tracked;
  }

  get trackedIds(): ReadonlySet<string> {
    return this.#tracked;
  }

  isTracked(userId: string): boolean {
    return this.#tracked.has(userId);
  }

  get(userId: string): Presence | undefined {
    return this.#snapshots.get(userId)?.presence;
  }

  /** Every tracked user whose presence is known, keyed by user ID. */
  all(): Record<string, Presence> {
    const result: Record<string, Presence> = {};
    for (const [userId, { presence }] of this.#snapshots) result[userId] = presence;
    return result;
  }

  setUser(user: APIUser): void {
    if (!this.isTracked(user.id)) return;
    this.#users.set(user.id, toDiscordUser(user, this.#users.get(user.id)));
    this.#publish(user.id);
  }

  setPresence(update: GatewayGuildMembersChunkPresence): void {
    const userId = update.user.id;
    if (!this.isTracked(userId)) return;

    this.#mergePartialUser(update.user);
    this.#states.set(userId, {
      status: update.status ?? 'offline',
      activities: update.activities ?? [],
      clientStatus: update.client_status ?? {},
    });
    this.#publish(userId);
  }

  /** Forgets a user who left the guild. Clients see them go offline. */
  remove(userId: string): void {
    if (!this.isTracked(userId)) return;
    this.#states.delete(userId);
    this.#publish(userId);
  }

  /**
   * Presence updates carry only the user fields that changed, so a username
   * or avatar change arrives here rather than as a member update.
   */
  #mergePartialUser(partial: Partial<APIUser> & Pick<APIUser, 'id'>): void {
    const current = this.#users.get(partial.id);
    if (!current) return;

    const merged: DiscordUser = {
      ...current,
      username: partial.username ?? current.username,
      global_name: partial.global_name !== undefined ? partial.global_name : current.global_name,
      avatar: partial.avatar !== undefined ? partial.avatar : current.avatar,
      discriminator: partial.discriminator ?? current.discriminator,
    };
    merged.display_name = merged.global_name ?? merged.username;
    this.#users.set(partial.id, merged);
  }

  #publish(userId: string): void {
    const user = this.#users.get(userId);
    if (!user) return;

    const presence = buildPresence(user, this.#states.get(userId) ?? OFFLINE);
    const serialized = JSON.stringify(presence);
    // Discord repeats identical presences often; only real changes go out.
    if (this.#snapshots.get(userId)?.serialized === serialized) return;

    this.#snapshots.set(userId, { presence, serialized });
    this.emit('update', userId, presence);
  }
}
