import { Client, GatewayDispatchEvents, GatewayIntentBits } from '@discordjs/core';
import { REST } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import type { Logger } from './logger.ts';
import type { PresenceStore } from './store.ts';

export interface GatewayOptions {
  token: string;
  guildId: string;
}

export interface Gateway {
  /** True once the tracked guild has been loaded on the current session. */
  ready(): boolean;
  destroy(): Promise<void>;
}

/** Close code Discord sends when a privileged intent is not enabled for the bot. */
const DISALLOWED_INTENTS = 4014;

/**
 * Banner, profile color and server tag changes produce no gateway event, so
 * full profiles are fetched again on this interval.
 */
const PROFILE_REFRESH_MS = 10 * 60_000;

export async function connectGateway(
  store: PresenceStore,
  logger: Logger,
  { token, guildId }: GatewayOptions,
): Promise<Gateway> {
  const rest = new REST({ version: '10' }).setToken(token);
  const gateway = new WebSocketManager({
    token,
    rest,
    // Both member and presence intents are privileged and must be enabled
    // for the application in the Discord Developer Portal.
    intents:
      GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildPresences,
  });
  const client = new Client({ rest, gateway });
  let guildLoaded = false;

  // A member lookup confirms the user is in the guild; the user lookup adds
  // the profile fields that member objects leave out.
  const loadProfile = async (userId: string) => {
    try {
      const member = await client.api.guilds.getMember(guildId, userId);
      store.setUser(member.user);
      store.setUser(await client.api.users.get(userId));
    } catch (error) {
      logger.warn('could not load tracked user', { userId, error });
    }
  };
  const loadProfiles = () => Promise.all([...store.trackedIds].map(loadProfile));

  const refresh = setInterval(() => {
    if (guildLoaded) void loadProfiles();
  }, PROFILE_REFRESH_MS);
  refresh.unref();

  client.on(GatewayDispatchEvents.Ready, ({ data }) => {
    guildLoaded = false;
    logger.info('gateway ready', { bot: data.user.username, guilds: data.guilds.length });
    if (!data.guilds.some((guild) => guild.id === guildId)) {
      logger.error('bot is not a member of the configured guild', { guildId });
    }
  });

  client.on(GatewayDispatchEvents.GuildCreate, async ({ data }) => {
    if (data.id !== guildId) return;

    for (const presence of data.presences ?? []) store.setPresence(presence);
    await loadProfiles();

    guildLoaded = true;
    logger.info('guild loaded', { guild: data.name, tracked: store.trackedIds.size });
  });

  client.on(GatewayDispatchEvents.GuildDelete, ({ data }) => {
    if (data.id === guildId) guildLoaded = false;
  });

  client.on(GatewayDispatchEvents.PresenceUpdate, ({ data }) => {
    if (data.guild_id === guildId) store.setPresence(data);
  });

  client.on(GatewayDispatchEvents.GuildMemberUpdate, ({ data }) => {
    if (data.guild_id === guildId) store.setUser(data.user);
  });

  client.on(GatewayDispatchEvents.GuildMemberRemove, ({ data }) => {
    if (data.guild_id === guildId) store.remove(data.user.id);
  });

  gateway.on(WebSocketShardEvents.Closed, (code) => {
    if (code === DISALLOWED_INTENTS) {
      logger.error(
        'Discord rejected the intents. Enable "Presence Intent" and "Server Members Intent" for the bot.',
      );
      return;
    }
    logger.warn('gateway closed', { code });
  });
  gateway.on(WebSocketShardEvents.Resumed, () => logger.info('gateway resumed'));
  gateway.on(WebSocketShardEvents.Error, (error) => logger.error('gateway error', { error }));

  await gateway.connect();

  return {
    ready: () => guildLoaded,
    destroy: async () => {
      clearInterval(refresh);
      await gateway.destroy();
    },
  };
}
