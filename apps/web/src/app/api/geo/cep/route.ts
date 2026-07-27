import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireAuth } from "@/lib/session";

/**
 * CEP → address lookup for the panel's address autofill (Brazilian postal
 * codes). Server-side proxy so no vendor key/CORS is exposed and results can be
 * bounded. Tries BrasilAPI (CEP v2, sometimes returns coordinates) and falls
 * back to ViaCEP. Auth-gated to avoid an open proxy. Returns a flat allowlist.
 */
export const GET = route(async (request) => {
  await requireAuth(request);

  const url = new URL(request.url);
  const cep = (url.searchParams.get("cep") ?? "").replace(/\D/g, "");
  if (cep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido." }, { status: 400 });
  }

  const timeout = (ms: number) => AbortSignal.timeout(ms);

  // BrasilAPI first: it aggregates providers and may include coordinates.
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      signal: timeout(3500),
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        street?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        location?: { coordinates?: { longitude?: number | string; latitude?: number | string } };
      };
      const lat = Number(data.location?.coordinates?.latitude);
      const lng = Number(data.location?.coordinates?.longitude);
      return NextResponse.json({
        postalCode: cep,
        addressLine: data.street || null,
        neighborhood: data.neighborhood || null,
        city: data.city || null,
        state: data.state || null,
        latitude: Number.isFinite(lat) && lat !== 0 ? lat : null,
        longitude: Number.isFinite(lng) && lng !== 0 ? lng : null,
      });
    }
  } catch {
    // fall through to ViaCEP
  }

  // ViaCEP fallback: address only (no coordinates).
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: timeout(3500),
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        erro?: boolean;
      };
      if (!data.erro) {
        return NextResponse.json({
          postalCode: cep,
          addressLine: data.logradouro || null,
          neighborhood: data.bairro || null,
          city: data.localidade || null,
          state: data.uf || null,
          latitude: null,
          longitude: null,
        });
      }
    }
  } catch {
    // fall through to not-found
  }

  return NextResponse.json({ error: "CEP não encontrado." }, { status: 404 });
});
