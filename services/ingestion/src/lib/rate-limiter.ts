import type IORedis from "ioredis";

export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly key: string,
  ) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

/**
 * Lua script: atomic token-bucket refill + consume.
 *
 * Time source is Redis' own TIME command, NOT the caller's clock. This means
 * multiple worker processes sharing a bucket all observe a single monotonic
 * clock — no NTP skew can cause tokens to over-credit or drift negative.
 *
 * ARGV:
 *   [1] capacity (max tokens)
 *   [2] refill    (tokens per second)
 *   [3] cost      (tokens to consume)
 * Returns: milliseconds to wait before retrying, or 0 if the consume succeeded.
 */
const ACQUIRE_SCRIPT = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refill = tonumber(ARGV[2])
  local cost = tonumber(ARGV[3])
  local t = redis.call('TIME')
  local now_ms = t[1] * 1000 + math.floor(t[2] / 1000)
  local state = redis.call('HMGET', key, 'tokens', 'ts')
  local tokens = tonumber(state[1]) or capacity
  local ts = tonumber(state[2]) or now_ms
  local elapsed = (now_ms - ts) / 1000
  if elapsed < 0 then elapsed = 0 end
  tokens = math.min(capacity, tokens + elapsed * refill)
  if tokens < cost then
    local needed = (cost - tokens) / refill
    return math.ceil(needed * 1000)
  end
  tokens = tokens - cost
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now_ms)
  redis.call('EXPIRE', key, 3600)
  return 0
`;

type RedisWithTokenBucket = IORedis & {
  acquireTokenBucket(key: string, capacity: number, refill: number, cost: number): Promise<number>;
};

/**
 * Idempotently registers the Lua script on a Redis connection. ioredis caches
 * the SHA and uses EVALSHA on subsequent calls, falling back to EVAL if the
 * script isn't loaded on the server (e.g., after a Redis restart).
 */
function attach(redis: IORedis): RedisWithTokenBucket {
  const typed = redis as RedisWithTokenBucket;
  if (typeof typed.acquireTokenBucket !== "function") {
    redis.defineCommand("acquireTokenBucket", {
      numberOfKeys: 1,
      lua: ACQUIRE_SCRIPT,
    });
  }
  return typed;
}

/**
 * Redis-backed token-bucket rate limiter.
 *
 * Each instance represents one bucket identified by `key` (typically
 * `source:<sourceId>` or `connectorConfig:<id>`). Tokens refill at
 * `refillPerSecond` up to `capacity`. `acquire(cost)` blocks until enough
 * tokens are available, optionally bounded by `maxWaitMs`.
 */
export class RateLimiter {
  private readonly redis: RedisWithTokenBucket;

  constructor(
    redis: IORedis,
    private readonly key: string,
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error(`RateLimiter[${key}]: capacity must be a positive finite number`);
    }
    if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
      throw new Error(`RateLimiter[${key}]: refillPerSecond must be a positive finite number`);
    }
    this.redis = attach(redis);
  }

  /**
   * Block until `cost` tokens are available, then consume them.
   *
   * @param cost      Tokens to consume (default 1). Must be <= capacity.
   * @param opts.maxWaitMs  Total wall-clock time the caller is willing to wait.
   *                        Throws RateLimitExceededError if projected wait
   *                        would exceed it. Default: no deadline.
   */
  async acquire(cost = 1, opts: { maxWaitMs?: number } = {}): Promise<void> {
    if (cost > this.capacity) {
      throw new RateLimitExceededError(
        `RateLimiter[${this.key}]: cost ${cost} exceeds capacity ${this.capacity}`,
        this.key,
      );
    }
    const deadline = opts.maxWaitMs !== undefined ? Date.now() + opts.maxWaitMs : undefined;

    for (;;) {
      const wait = await this.redis.acquireTokenBucket(
        this.key,
        this.capacity,
        this.refillPerSecond,
        cost,
      );
      if (wait === 0) return;
      if (deadline !== undefined && Date.now() + wait > deadline) {
        throw new RateLimitExceededError(
          `RateLimiter[${this.key}]: projected wait ${wait}ms exceeds maxWaitMs ${opts.maxWaitMs}`,
          this.key,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
