import { createClient } from 'redis';
import type { Logger } from '../../application/ports';

const create = (url: string) => createClient({ url });

/** The concrete client type our factory produces (RESP3, no modules or scripts). */
export type RedisClient = ReturnType<typeof create>;

/**
 * The single shared node-redis client (LLD SP-19 §6): room state, Lua CAS and rate limits run on
 * it, and the Socket.IO adapter duplicates it for its blocking stream reads. node-redis
 * reconnects on its own; errors are logged rather than crashing the process.
 */
export const connectRedis = async (url: string, logger: Logger): Promise<RedisClient> => {
  const client = create(url);
  client.on('error', (error: unknown) => {
    logger.error({ err: error }, 'redis connection error');
  });
  await client.connect();
  return client;
};
