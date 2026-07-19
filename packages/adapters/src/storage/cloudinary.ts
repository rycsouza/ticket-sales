import { createHash } from "node:crypto";
import type { PublicImageStoragePort, UploadPublicImageInput } from "@ingressos/core/ports";

/**
 * Cloudinary signed-upload adapter (ARQUITETURA: Cloudinary = imagens públicas
 * de evento). Sem SDK — POST multipart assinado (SHA-1, mesmo esquema da API).
 * `format: webp` força re-encode: bytes enviados nunca são servidos verbatim.
 */
export class CloudinaryAdapter implements PublicImageStoragePort {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  /** @param cloudinaryUrl formato cloudinary://<api_key>:<api_secret>@<cloud_name> */
  constructor(cloudinaryUrl: string) {
    const parsed = parseCloudinaryUrl(cloudinaryUrl);
    this.cloudName = parsed.cloudName;
    this.apiKey = parsed.apiKey;
    this.apiSecret = parsed.apiSecret;
  }

  async upload(input: UploadPublicImageInput): Promise<{ url: string }> {
    const timestamp = Math.floor(Date.now() / 1000);
    // Assinatura: parâmetros (exceto file/api_key) ordenados + api_secret (SHA-1).
    const params: Record<string, string> = {
      folder: input.folder,
      format: "webp",
      timestamp: String(timestamp),
    };
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    const signature = createHash("sha1").update(`${toSign}${this.apiSecret}`).digest("hex");

    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.append(key, value);
    form.append("api_key", this.apiKey);
    form.append("signature", signature);
    form.append("file", new Blob([Buffer.from(input.body)], { type: input.contentType }));

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
    );

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed with status ${response.status}`);
    }
    const data = (await response.json()) as { secure_url?: string };
    if (!data.secure_url) {
      throw new Error("Cloudinary upload returned no secure_url");
    }
    return { url: data.secure_url };
  }
}

export function parseCloudinaryUrl(cloudinaryUrl: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  let url: URL;
  try {
    url = new URL(cloudinaryUrl);
  } catch {
    throw new Error("Invalid CLOUDINARY_URL");
  }
  if (url.protocol !== "cloudinary:" || !url.username || !url.password || !url.hostname) {
    throw new Error("Invalid CLOUDINARY_URL");
  }
  return {
    apiKey: decodeURIComponent(url.username),
    apiSecret: decodeURIComponent(url.password),
    cloudName: url.hostname,
  };
}
