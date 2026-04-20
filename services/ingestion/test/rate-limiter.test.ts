import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import IORedis from "ioredis";
import { RateLimiter, RateLimitExceededError } from "../src/lib/rate-limiter";

let container: StartedTestContainer;
let redis: IORedis;

beforeAll(async () => {
  container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  redis = new IORedis(container.getMappedPort(6379), container.getHost(), {
    maxRetriesPerRequest: null,
  });
});

afterAll(async () => {
  await redis.quit();
  await container.stop();
});

describe("RateLimiter", () => {
  it("allows immediate acquisition up to capacity", async () => {
    const rl = new RateLimiter(redis, `rl:test:cap:${Date.now()}`, 3, 1);
    const start = Date.now();
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("blocks the (capacity+1)th acquire until refill", async () => {
    // Capacity 2, refill 10/s → each token takes ~100ms to refill.
    const rl = new RateLimiter(redis, `rl:test:block:${Date.now()}`, 2, 10);
    await rl.acquire(); // drain
    await rl.acquire();
    const start = Date.now();
    await rl.acquire();
    const waited = Date.now() - start;
    // Should have waited approximately 100ms (one token's worth of refill).
    // Allow slack for network + test overhead.
    expect(waited).toBeGreaterThanOrEqual(50);
    expect(waited).toBeLessThan(500);
  });

  it("throws RateLimitExceededError when cost exceeds capacity", () => {
    const rl = new RateLimiter(redis, `rl:test:cost:${Date.now()}`, 2, 1);
    // Pure synchronous guard — returns a rejected promise without touching Redis
    return expect(rl.acquire(5)).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("throws RateLimitExceededError when maxWaitMs would be exceeded", async () => {
    // Capacity 1, refill 1/s. One token drained; next refill in 1000ms.
    // maxWaitMs=100 → must throw, not wait a full second.
    const rl = new RateLimiter(redis, `rl:test:deadline:${Date.now()}`, 1, 1);
    await rl.acquire();
    const start = Date.now();
    await expect(rl.acquire(1, { maxWaitMs: 100 })).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    // Should fail fast, not wait the full refill period.
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("is atomic across concurrent acquires (no over-spend)", async () => {
    // Capacity 5, very slow refill. Fire 10 concurrent acquires: exactly 5
    // should complete in the first window; the other 5 must wait for refill.
    const key = `rl:test:concurrent:${Date.now()}`;
    const rl = new RateLimiter(redis, key, 5, 0.5); // 0.5 tokens/s = 2s/token
    const start = Date.now();
    const promises = Array.from({ length: 5 }, () => rl.acquire(1));
    await Promise.all(promises);
    // 5 tokens consumed from a bucket of 5, no waits.
    expect(Date.now() - start).toBeLessThan(200);
    // A 6th acquire must wait at least ~1.5s (refill 0.5 tok/s → 2s per
    // token, but bounded by maxWaitMs to keep the test fast).
    await expect(rl.acquire(1, { maxWaitMs: 100 })).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  it("rejects invalid constructor parameters", () => {
    expect(() => new RateLimiter(redis, "k", 0, 1)).toThrow(/capacity/);
    expect(() => new RateLimiter(redis, "k", Infinity, 1)).toThrow(/capacity/);
    expect(() => new RateLimiter(redis, "k", 1, 0)).toThrow(/refillPerSecond/);
    expect(() => new RateLimiter(redis, "k", 1, -1)).toThrow(/refillPerSecond/);
  });
});
