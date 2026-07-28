"use client";

/**
 * Client-side offline support for the gate (portaria). The server builds a pack
 * of *token hashes* for VALID tickets; here we store it, validate scans locally
 * by hashing the raw token with the same SHA-256 the core uses, record
 * admissions in a queue, and sync them when back online. Raw tokens live only
 * on this device until synced; the pack never contains raw tokens.
 */

export interface OfflinePackTicket {
  tokenHash: string;
  participantName: string | null;
}
interface StoredPack {
  version: string;
  byHash: Record<string, { participantName: string | null }>;
}
export interface QueuedAdmission {
  token: string;
  tokenHash: string;
  checkedInAt: string; // ISO
  participantName: string | null;
}
export type LocalOutcome = "accepted" | "already_checked_in" | "not_found";
export interface LocalResult {
  outcome: LocalOutcome;
  participantName: string | null;
}

const packKey = (eventId: string) => `ci:pack:${eventId}`;
const queueKey = (eventId: string) => `ci:queue:${eventId}`;
const usedKey = (eventId: string) => `ci:used:${eventId}`; // tokenHashes admitted locally
const deviceKey = "ci:device";

/** Stable per-device id, used for offline sync conflict detection. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(deviceKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(deviceKey, id);
  }
  return id;
}

/** SHA-256 hex of the raw token — must match core `hashToken`. */
export async function sha256Hex(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePack(
  eventId: string,
  pack: { version: string; tickets: OfflinePackTicket[] },
): number {
  const byHash: StoredPack["byHash"] = {};
  for (const t of pack.tickets) byHash[t.tokenHash] = { participantName: t.participantName };
  localStorage.setItem(packKey(eventId), JSON.stringify({ version: pack.version, byHash }));
  return pack.tickets.length;
}

export function getPackInfo(eventId: string): { version: string; count: number } | null {
  const pack = readJson<StoredPack | null>(packKey(eventId), null);
  if (!pack) return null;
  return { version: pack.version, count: Object.keys(pack.byHash).length };
}

function readUsed(eventId: string): Set<string> {
  return new Set(readJson<string[]>(usedKey(eventId), []));
}
function writeUsed(eventId: string, used: Set<string>): void {
  localStorage.setItem(usedKey(eventId), JSON.stringify([...used]));
}

/**
 * Validate a scanned token against the local pack and mark it admitted. Returns
 * `not_found` when the token isn't in the pack (unknown, or issued after the
 * pack was downloaded — reconnect to be sure), `already_checked_in` when this
 * device already admitted it, else `accepted` (and queues the admission).
 */
export async function validateLocally(eventId: string, token: string): Promise<LocalResult> {
  const pack = readJson<StoredPack | null>(packKey(eventId), null);
  if (!pack) return { outcome: "not_found", participantName: null };
  const hash = await sha256Hex(token.trim());
  const entry = pack.byHash[hash];
  if (!entry) return { outcome: "not_found", participantName: null };

  const used = readUsed(eventId);
  if (used.has(hash)) return { outcome: "already_checked_in", participantName: entry.participantName };

  used.add(hash);
  writeUsed(eventId, used);

  const queue = readJson<QueuedAdmission[]>(queueKey(eventId), []);
  queue.push({
    token: token.trim(),
    tokenHash: hash,
    checkedInAt: new Date().toISOString(),
    participantName: entry.participantName,
  });
  localStorage.setItem(queueKey(eventId), JSON.stringify(queue));

  return { outcome: "accepted", participantName: entry.participantName };
}

export function getQueue(eventId: string): QueuedAdmission[] {
  return readJson<QueuedAdmission[]>(queueKey(eventId), []);
}

/** Remove the given tokens from the pending queue after a successful sync. */
export function removeFromQueue(eventId: string, tokens: string[]): void {
  const drop = new Set(tokens);
  const queue = readJson<QueuedAdmission[]>(queueKey(eventId), []).filter((q) => !drop.has(q.token));
  localStorage.setItem(queueKey(eventId), JSON.stringify(queue));
}

/** Drop a locally-admitted mark (e.g. server reported a conflict on sync). */
export function clearUsedHash(eventId: string, tokenHash: string): void {
  const used = readUsed(eventId);
  if (used.delete(tokenHash)) writeUsed(eventId, used);
}
