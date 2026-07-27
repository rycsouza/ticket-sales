"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Field, Input } from "@/components/ui";

export interface AddressValue {
  venueName: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

export const emptyAddress: AddressValue = {
  venueName: "",
  postalCode: "",
  addressLine: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  latitude: null,
  longitude: null,
};

function formatCep(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Structured address input with CEP autofill (self-service, no vendor key).
 * Typing a valid CEP fills street/neighborhood/city/UF (and map coordinates
 * when available) from /api/geo/cep; the operator only adds number/complement.
 */
export function AddressFields({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  async function lookupCep(rawCep: string) {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/geo/cep?cep=${cep}`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const d = (await res.json()) as Partial<AddressValue>;
      onChange({
        ...value,
        postalCode: cep,
        // Only overwrite fields the lookup resolved; keep number/complement/venue.
        addressLine: d.addressLine ?? value.addressLine,
        neighborhood: d.neighborhood ?? value.neighborhood,
        city: d.city ?? value.city,
        state: d.state ?? value.state,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Local" htmlFor="addr-venue" hint="Nome do espaço (ex.: Quadra Pérola Negra).">
        <Input
          id="addr-venue"
          value={value.venueName}
          onChange={(e) => set({ venueName: e.target.value })}
          placeholder="Clube da Cidade"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field
          label="CEP"
          htmlFor="addr-cep"
          className="col-span-1"
          hint={
            status === "loading"
              ? "Buscando…"
              : status === "error"
                ? "CEP não encontrado"
                : "Preenche o endereço"
          }
        >
          <div className="relative">
            <Input
              id="addr-cep"
              inputMode="numeric"
              value={formatCep(value.postalCode)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                set({ postalCode: digits });
                if (digits.length === 8) void lookupCep(digits);
              }}
              onBlur={() => void lookupCep(value.postalCode)}
              placeholder="00000-000"
            />
            {status === "loading" && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-muted" />
            )}
          </div>
        </Field>
        <Field label="Endereço" htmlFor="addr-line" className="col-span-2">
          <Input
            id="addr-line"
            value={value.addressLine}
            onChange={(e) => set({ addressLine: e.target.value })}
            placeholder="Rua / Avenida"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Número" htmlFor="addr-number" className="col-span-1">
          <Input
            id="addr-number"
            value={value.addressNumber}
            onChange={(e) => set({ addressNumber: e.target.value })}
            placeholder="123"
          />
        </Field>
        <Field label="Complemento" htmlFor="addr-comp" className="col-span-2">
          <Input
            id="addr-comp"
            value={value.addressComplement}
            onChange={(e) => set({ addressComplement: e.target.value })}
            placeholder="Bloco, sala, referência…"
          />
        </Field>
      </div>

      <Field label="Bairro" htmlFor="addr-neigh">
        <Input
          id="addr-neigh"
          value={value.neighborhood}
          onChange={(e) => set({ neighborhood: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Cidade" htmlFor="addr-city" className="col-span-2">
          <Input
            id="addr-city"
            value={value.city}
            onChange={(e) => set({ city: e.target.value })}
          />
        </Field>
        <Field label="UF" htmlFor="addr-uf">
          <Input
            id="addr-uf"
            maxLength={2}
            value={value.state}
            onChange={(e) => set({ state: e.target.value.toUpperCase() })}
          />
        </Field>
      </div>

      {value.latitude !== null && value.longitude !== null && (
        <p className="flex items-center gap-1.5 text-small text-ink-muted">
          <MapPin className="size-3.5 text-success" />
          Localização no mapa definida — o comprador verá um pino na página do evento.
        </p>
      )}
    </div>
  );
}

/** Builds the API payload fields from an AddressValue (empties → omitted). */
export function addressToPayload(a: AddressValue): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.venueName.trim()) out.venueName = a.venueName.trim();
  if (/^\d{8}$/.test(a.postalCode)) out.postalCode = a.postalCode;
  if (a.addressLine.trim()) out.addressLine = a.addressLine.trim();
  if (a.addressNumber.trim()) out.addressNumber = a.addressNumber.trim();
  if (a.addressComplement.trim()) out.addressComplement = a.addressComplement.trim();
  if (a.neighborhood.trim()) out.neighborhood = a.neighborhood.trim();
  if (a.city.trim()) out.city = a.city.trim();
  if (a.state.trim()) out.state = a.state.trim().toUpperCase();
  if (a.latitude !== null) out.latitude = a.latitude;
  if (a.longitude !== null) out.longitude = a.longitude;
  return out;
}
