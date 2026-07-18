/**
 * Private object storage port — Cloudflare R2 (S3 API) initially.
 * Used for exports and offline check-in packages. ALWAYS private: access is
 * granted only through short-lived signed URLs, and every grant is audited
 * by the caller (FR-CRM-007, FR-AUD-006).
 *
 * Public event images do NOT go through this port (they use Cloudinary).
 */
export interface StoragePort {
  put(input: PutObjectInput): Promise<void>;
  /** Signed download URL with mandatory expiration. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | string;
  contentType: string;
}
