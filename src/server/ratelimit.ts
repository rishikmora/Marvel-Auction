/**
 * Token-bucket rate limiting, keyed per connection and per action.
 *
 * Bids get their own tighter bucket: a bid is the one action that mutates money, so
 * spamming it is both the most attractive abuse and the most expensive to broadcast.
 */
export interface BucketConfig {
  capacity: number;
  refillPerSecond: number;
}

const DEFAULT_BUCKETS: Record<string, BucketConfig> = {
  bid: { capacity: 8, refillPerSecond: 3 },
  host: { capacity: 12, refillPerSecond: 4 },
  lobby: { capacity: 10, refillPerSecond: 2 },
  connect: { capacity: 6, refillPerSecond: 0.5 },
};

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly configs: Record<string, BucketConfig> = DEFAULT_BUCKETS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true when the action is allowed and consumes a token. */
  take(key: string, action: keyof typeof DEFAULT_BUCKETS | string): boolean {
    const config = this.configs[action] ?? this.configs.lobby;
    const id = `${key}:${action}`;
    const at = this.now();
    const bucket = this.buckets.get(id) ?? { tokens: config.capacity, lastRefill: at };

    const elapsed = (at - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsed * config.refillPerSecond);
    bucket.lastRefill = at;

    if (bucket.tokens < 1) {
      this.buckets.set(id, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(id, bucket);
    return true;
  }

  forget(key: string): void {
    for (const id of this.buckets.keys()) {
      if (id.startsWith(`${key}:`)) this.buckets.delete(id);
    }
  }
}

export const rateLimiter = new RateLimiter();
