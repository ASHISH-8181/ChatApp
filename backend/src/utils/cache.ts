/**
 * High-performance In-Memory TTL Cache with Tag & Prefix Invalidation.
 * Reduces redundant database queries to Neon PostgreSQL for messages,
 * user directories, friendship lists, groups, and contacts.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: Set<string>;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private tagToKeys = new Map<string, Set<string>>();
  private cleanupInterval: any;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodically sweep expired entries to keep memory footprint minimal
    this.cleanupInterval = setInterval(() => {
      this.sweepExpired();
    }, cleanupIntervalMs);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Get an item from the cache if present and not expired.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set an item in the cache with a time-to-live (TTL) and optional tags for grouped invalidation.
   */
  set<T>(key: string, value: T, ttlMs = 60_000, tags: string[] = []): void {
    // If key already existed, remove it from existing tag index
    const existing = this.cache.get(key);
    if (existing) {
      for (const tag of existing.tags) {
        this.tagToKeys.get(tag)?.delete(key);
      }
    }

    const tagSet = new Set(tags);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      tags: tagSet,
    });

    for (const tag of tags) {
      if (!this.tagToKeys.has(tag)) {
        this.tagToKeys.set(tag, new Set());
      }
      this.tagToKeys.get(tag)!.add(key);
    }
  }

  /**
   * Retrieve from cache, or if not found/expired, execute fetcher, store result, and return.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = 60_000,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    this.set(key, fresh, ttlMs, tags);
    return fresh;
  }

  /**
   * Delete a specific cache key.
   */
  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        const keySet = this.tagToKeys.get(tag);
        if (keySet) {
          keySet.delete(key);
          if (keySet.size === 0) {
            this.tagToKeys.delete(tag);
          }
        }
      }
      this.cache.delete(key);
    }
  }

  /**
   * Invalidate all cache entries associated with a specific tag.
   * e.g., invalidateTag("user:123") removes all cached queries mentioning user 123.
   */
  invalidateTag(tag: string): void {
    const keys = this.tagToKeys.get(tag);
    if (!keys) return;

    for (const key of Array.from(keys)) {
      this.cache.delete(key);
    }
    this.tagToKeys.delete(tag);
  }

  /**
   * Invalidate multiple tags at once.
   */
  invalidateTags(tags: string[]): void {
    for (const tag of tags) {
      this.invalidateTag(tag);
    }
  }

  /**
   * Invalidate all keys matching a given prefix.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.cache.clear();
    this.tagToKeys.clear();
  }

  /**
   * Sweep all expired keys.
   */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
      }
    }
  }
}

export const serverCache = new MemoryCache();
