import type { CachePort } from "@ingressos/core/ports";

/**
 * In-memory CachePort — development fallback ONLY. In serverless production
 * each instance has its own memory, which makes rate limiting ineffective;
 * the composition root refuses to use this when NODE_ENV === "production".
 */
export class MemoryCache implements CachePort {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private alive(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.alive(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = this.alive(key);
    const next = current ? Number(current.value) + 1 : 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: current?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return next;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
