export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function isLogLevel(value: string): value is LogLevel {
  return value in LEVELS;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === 'string') return /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value) ?? 'undefined';
}

/** Writes `time level message key=value …` lines, one per event. */
export function createLogger(minimum: LogLevel, write = console.log): Logger {
  const log = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (LEVELS[level] < LEVELS[minimum]) return;
    const pairs = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${formatValue(value)}`);
    write([new Date().toISOString(), level.toUpperCase().padEnd(5), message, ...pairs].join(' '));
  };

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
  };
}

/** A logger that discards everything, for tests. */
export const silentLogger: Logger = createLogger('error', () => {});
