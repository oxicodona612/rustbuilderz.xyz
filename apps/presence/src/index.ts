import { ConfigError, loadConfig, type Config } from './config.ts';
import { connectGateway } from './discord.ts';
import { createLogger } from './logger.ts';
import { createPresenceServer } from './server.ts';
import { PresenceStore } from './store.ts';

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const store = new PresenceStore(config.trackedUserIds);
let gatewayReady = () => false;

const server = createPresenceServer(store, logger, {
  allowedOrigins: config.allowedOrigins,
  heartbeatIntervalMs: config.heartbeatIntervalMs,
  maxConnections: config.maxConnections,
  gatewayReady: () => gatewayReady(),
});

server.http.listen(config.port, config.host, () => {
  logger.info('listening', { host: config.host, port: config.port });
});

const gateway = await connectGateway(store, logger, {
  token: config.discordToken,
  guildId: config.guildId,
}).catch(async (error: unknown) => {
  logger.error('could not connect to Discord', { error });
  await server.close();
  process.exit(1);
});
gatewayReady = gateway.ready;

let stopping = false;
async function shutdown(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  logger.info('shutting down', { signal });

  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();

  await Promise.allSettled([server.close(), gateway.destroy()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
