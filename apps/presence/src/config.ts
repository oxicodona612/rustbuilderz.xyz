import { isLogLevel, type LogLevel } from './logger.ts';

export interface Config {
  discordToken: string;
  guildId: string;
  trackedUserIds: ReadonlySet<string>;
  host: string;
  port: number;
  /** `'*'` allows every origin. */
  allowedOrigins: '*' | ReadonlySet<string>;
  heartbeatIntervalMs: number;
  maxConnections: number;
  logLevel: LogLevel;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const SNOWFLAKE = /^\d{17,20}$/;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ConfigError(`${key} is required`);
  return value;
}

function snowflake(value: string, key: string): string {
  if (!SNOWFLAKE.test(value)) throw new ConfigError(`${key} must be a Discord ID, got "${value}"`);
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${key} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const trackedUserIds = list(required(env, 'TRACKED_USER_IDS')).map((id) =>
    snowflake(id, 'TRACKED_USER_IDS'),
  );

  const origins = list(env.ALLOWED_ORIGINS);
  const logLevel = env.LOG_LEVEL?.trim() || 'info';
  if (!isLogLevel(logLevel)) {
    throw new ConfigError(`LOG_LEVEL must be debug, info, warn or error, got "${logLevel}"`);
  }

  return {
    discordToken: required(env, 'DISCORD_TOKEN'),
    guildId: snowflake(required(env, 'DISCORD_GUILD_ID'), 'DISCORD_GUILD_ID'),
    trackedUserIds: new Set(trackedUserIds),
    host: env.HOST?.trim() || '0.0.0.0',
    port: integer(env, 'PORT', 4100, 0),
    allowedOrigins: origins.length === 0 || origins.includes('*') ? '*' : new Set(origins),
    heartbeatIntervalMs: integer(env, 'HEARTBEAT_INTERVAL_MS', 30_000, 1_000),
    maxConnections: integer(env, 'MAX_CONNECTIONS', 1_000, 1),
    logLevel,
  };
}
