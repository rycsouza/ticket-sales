"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { LeafletMap } from "@/components/leaflet-map";

// Geographic center of Brazil — the map's fallback view until a point is set.
const BRAZIL_CENTER = { lat: -14.235, lng: -51.925 };

interface InitialLocation {
  venueName: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function LocationEditor({
  orgId,
  eventId,
  initial,
}: {
  orgId: string;
  eventId: string;
  initial: InitialLocation;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    venueName: initial.venueName ?? "",
    addressLine: initial.addressLine ?? "",
    city: initial.city ?? "",
    state: initial.state ?? "",
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial.latitude !== null && initial.longitude !== null
      ? { lat: initial.latitude, lng: initial.longitude }
      : null,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function geocode() {
    const query = [form.addressLine, form.city, form.state, "Brasil"].filter(Boolean).join(", ");
    if (query.replace(/[, ]/g, "").length < 3) {
      setError("Preencha o endereço ou a cidade para buscar no mapa.");
      return;
    }
    setError(null);
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: "application/json" } },
      );
      const data = (await res.json().catch(() => [])) as { lat: string; lon: string }[];
      if (!data[0]) {
        setError("Não encontramos esse endereço. Ajuste os campos ou marque o ponto no mapa.");
        return;
      }
      setCoords({ lat: Number(data[0].lat), lng: Number(data[0].lon) });
      setSaved(false);
    } catch {
      setError("Falha ao buscar o endereço. Tente novamente ou marque o ponto no mapa.");
    } finally {
      setGeocoding(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {};
      if (form.venueName.trim()) body.venueName = form.venueName.trim();
      if (form.addressLine.trim()) body.addressLine = form.addressLine.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.state.trim()) body.state = form.state.trim().toUpperCase();
      if (coords) {
        body.latitude = coords.lat;
        body.longitude = coords.lng;
      }
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a localização.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const center = coords ?? BRAZIL_CENTER;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Nome do local" htmlFor="loc-venue" hint="Ex.: Clube da Cidade, Arena Norte.">
          <Input id="loc-venue" value={form.venueName} onChange={(e) => set("venueName", e.target.value)} />
        </Field>
        <Field label="Endereço" htmlFor="loc-address">
          <Input
            id="loc-address"
            value={form.addressLine}
            onChange={(e) => set("addressLine", e.target.value)}
            placeholder="Rua, número, bairro"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cidade" htmlFor="loc-city" className="col-span-2">
            <Input id="loc-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="UF" htmlFor="loc-uf">
            <Input
              id="loc-uf"
              maxLength={2}
              value={form.state}
              onChange={(e) => set("state", e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <Button
          variant="outline"
          leftIcon={<Search className="size-4" />}
          loading={geocoding}
          onClick={() => void geocode()}
        >
          Buscar endereço no mapa
        </Button>

        {coords ? (
          <p className="flex items-center gap-1.5 text-small text-ink-muted">
            <MapPin className="size-4 text-success" />
            Ponto definido: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        ) : (
          <p className="text-small text-ink-muted">
            Nenhum ponto definido ainda. Busque o endereço ou clique no mapa.
          </p>
        )}

        {error && <p className="text-small text-danger">{error}</p>}

        <div className="flex items-center gap-3" aria-live="polite">
          <Button loading={busy} onClick={() => void save()}>
            Salvar localização
          </Button>
          {saved && <span className="text-small font-medium text-success-text">Localização salva.</span>}
        </div>
      </div>

      <div>
        <LeafletMap
          lat={center.lat}
          lng={center.lng}
          zoom={coords ? 15 : 4}
          interactive
          onChange={(lat, lng) => {
            setCoords({ lat, lng });
            setSaved(false);
          }}
          className="h-72 w-full overflow-hidden rounded-xl border border-line"
        />
        <p className="mt-2 text-caption text-ink-muted">
          Clique no mapa ou arraste o marcador para ajustar o ponto exato. Mapa por OpenStreetMap.
        </p>
      </div>
    </div>
  );
}
