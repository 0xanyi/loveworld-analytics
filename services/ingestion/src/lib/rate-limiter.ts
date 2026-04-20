import type IORedis from "ioredis";

/**
 * Redis-backed token-bucket rate limiter.
 *
 * Each `RateLimiter` instance represents one bucket identified by `key`
 * (typically `source:<sourceId>` or `connectorConfig:<id>`). Tokens refill
 * at `refillPerSecond` up to `capacity`. `acquire(cost)` blocks until
 * enough tokens are available.
 *
 * The refill + consume decision runs atomically inside Redis via EVAL so
 * multiple workers racing on the same bucket cannot over-spend.
 */
export class RateLimiter {
  constructor(
    private readonly redis: IORedis,
    private readonly key: string,
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  /**
   * Block until `cost` tokens are available, then consume them.
   * Recursion is bounded in practice because refillPerSecond > 0 guarantees
   * forward progress; callers should still pass reasonable costs (cost <= capacity).
   */
  async acquire(cost = 1): Promise<void> {
    if (cost > this.capacity) {
      throw new Error(
        `RateLimiter[${this.key}]: cost ${cost} exceeds capacity ${this.capacity}`,
      );
    }
    const now = Date.now();
    const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])
      local state = redis.call('HMGET', key, 'tokens', 'ts')
      local tokens = tonumber(state[1]) or capacity
      local ts = tonumber(state[2]) or now
      local elapsed = (now - ts) / 1000
      tokens = math.min(capacity, tokens + elapsed * refill)
      if tokens < cost then
        local needed = (cost - tokens) / refill
        return math.ceil(needed * 1000)
      end
      tokens = tokens - cost
      redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
      redis.call('EXPIRE', key, 3600)
      return 0
    `;
    const wait = (await this.redis.eval(
      script,
      1,
      this.key,
      this.capacity,
      this.refillPerSecond,
      now,
      cost,
    )) as number;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      return this.acquire(cost);
    }
  }
}
