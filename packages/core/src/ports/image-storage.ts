/**
 * Public image storage port — Cloudinary initially. Used for producer-facing
 * branding assets (event page logo/banner/favicon). Deliberately separate from
 * StoragePort: that one is R2/private-only (signed URLs, audited grants),
 * while these images are public by design and served from the CDN.
 */
export interface PublicImageStoragePort {
  upload(input: UploadPublicImageInput): Promise<{ url: string }>;
}

export interface UploadPublicImageInput {
  /** Org/event-scoped folder derived from the authenticated context. */
  folder: string;
  body: Uint8Array;
  contentType: string;
}
