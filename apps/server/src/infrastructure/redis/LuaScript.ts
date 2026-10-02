import { createHash } from 'node:crypto';
import { ErrorReply } from 'redis';
import type { RedisClient } from './client';

/**
 * A Lua script run by its SHA1 (EVALSHA), loading it on the first NOSCRIPT reply, so the script
 * body crosses the network only once per Redis server (and again after a Redis restart).
 */
export class LuaScript {
  private readonly sha: string;

  constructor(private readonly source: string) {
    this.sha = createHash('sha1').update(source).digest('hex');
  }

  async run(client: RedisClient, keys: string[], args: string[]): Promise<unknown> {
    try {
      return await client.evalSha(this.sha, { keys, arguments: args });
    } catch (error) {
      if (error instanceof ErrorReply && error.message.startsWith('NOSCRIPT')) {
        return client.eval(this.source, { keys, arguments: args });
      }
      throw error;
    }
  }
}
