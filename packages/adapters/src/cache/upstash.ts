import type { CachePort } from "@ingressos/core/ports";

/**
 * Upstash Redis adapter over the REST API (serverless-friendly, no TCP
 * connections). Uses plain fetch — no SDK dependency needed for these five
 * commands (AGENTS.md: avoid dependencies for trivial tasks).
 */
export class UpstashRedisCache implements CachePort {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async command<T>(parts: (string | number)[]): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      // Redis commands are fast; do not hang a checkout on a cache hiccup.
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`Upstash request failed with status ${response.status}`);
    }
    const data = (await response.json()) as { result: T };
    return data.result;
  }

  async get(key: string): Promise<string | null> {
    return this.command<string | null>(["GET", key]);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(["SET", key, value, "EX", ttlSeconds]);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.command<string | null>([
      "SET",
      key,
      value,
      "NX",
      "EX",
      ttlSeconds,
    ]);
    return result === "OK";
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.command<number>(["INCR", key]);
    if (count === 1) {
      // First hit in the window — set the expiry. A crash between INCR and
      // EXPIRE could leave a keyless TTL; NX keeps retries harmless.
      await this.command(["EXPIRE", key, ttlSeconds, "NX"]);
    }
    return count;
  }

  async delete(key: string): Promise<void> {
    await this.command(["DEL", key]);
  }
}
