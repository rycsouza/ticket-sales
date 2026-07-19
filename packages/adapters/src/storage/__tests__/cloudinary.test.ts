import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudinaryAdapter, parseCloudinaryUrl } from "../cloudinary";

const URL_OK = "cloudinary://my-key:my-secret@my-cloud";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseCloudinaryUrl", () => {
  it("extracts key, secret and cloud name", () => {
    expect(parseCloudinaryUrl(URL_OK)).toEqual({
      apiKey: "my-key",
      apiSecret: "my-secret",
      cloudName: "my-cloud",
    });
  });

  it("rejects malformed URLs", () => {
    for (const bad of ["", "https://x", "cloudinary://only-key@cloud", "cloudinary://@cloud"]) {
      expect(() => parseCloudinaryUrl(bad)).toThrow("Invalid CLOUDINARY_URL");
    }
  });
});

describe("CloudinaryAdapter.upload", () => {
  it("posts a signed multipart upload and returns secure_url", async () => {
    const calls: { url: string; form: FormData }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), form: init?.body as FormData });
        return new Response(
          JSON.stringify({ secure_url: "https://res.cloudinary.com/my-cloud/image/x.webp" }),
          { status: 200 },
        );
      }),
    );

    const adapter = new CloudinaryAdapter(URL_OK);
    const result = await adapter.upload({
      folder: "orgs/o1/events/e1/page",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });

    expect(result.url).toBe("https://res.cloudinary.com/my-cloud/image/x.webp");
    expect(calls[0]?.url).toBe("https://api.cloudinary.com/v1_1/my-cloud/image/upload");

    const form = calls[0]!.form;
    expect(form.get("api_key")).toBe("my-key");
    expect(form.get("folder")).toBe("orgs/o1/events/e1/page");
    expect(form.get("format")).toBe("webp"); // re-encode: bytes nunca servidos verbatim

    // Assinatura reproduzível: sha1 dos params ordenados + secret
    const ts = form.get("timestamp") as string;
    const expected = createHash("sha1")
      .update(`folder=orgs/o1/events/e1/page&format=webp&timestamp=${ts}my-secret`)
      .digest("hex");
    expect(form.get("signature")).toBe(expected);
  });

  it("throws on non-2xx and on missing secure_url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const adapter = new CloudinaryAdapter(URL_OK);
    await expect(
      adapter.upload({ folder: "f", body: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow("status 401");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(
      adapter.upload({ folder: "f", body: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow("no secure_url");
  });
});
