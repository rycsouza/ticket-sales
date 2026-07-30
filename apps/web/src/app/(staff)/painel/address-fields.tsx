"use client";

import { Field, Input } from "@/components/ui";

export interface AddressValue {
  venueName: string;
  city: string;
  state: string;
}

export const emptyAddress: AddressValue = {
  venueName: "",
  city: "",
  state: "",
};

/**
 * Minimal, low-friction location: one free-text "Local" field plus optional
 * city/UF for listings. The public event page's map geocodes this text and
 * drops a labelled pin (no CEP, no vendor key, no structured address form).
 */
export function AddressFields({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
}) {
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <Field
        label="Local"
        htmlFor="addr-venue"
        hint="Nome e/ou endereço do local. Aparece na página e vira o pino no mapa."
      >
        <Input
          id="addr-venue"
          value={value.venueName}
          onChange={(e) => set({ venueName: e.target.value })}
          placeholder="Ex.: Quadra Pérola Negra — Av. Gastão Vidigal, 620, São Paulo"
        />
      </Field>

      {/* 320px: cidade e UF espremidas em 3 colunas fixas → UF vira coluna estreita fixa */}
      <div className="grid grid-cols-[1fr_5rem] gap-3 sm:grid-cols-3">
        <Field label="Cidade (opcional)" htmlFor="addr-city" className="sm:col-span-2">
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
    </div>
  );
}

/** Builds the API payload fields from an AddressValue (empties → omitted). */
export function addressToPayload(a: AddressValue): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.venueName.trim()) out.venueName = a.venueName.trim();
  if (a.city.trim()) out.city = a.city.trim();
  if (a.state.trim()) out.state = a.state.trim().toUpperCase();
  return out;
}
