"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Field, Select } from "@/components/ui";

/**
 * Event picker for the org-level "commission payouts" card. Commissions are
 * always event-scoped (payables come from each event's ledger), so paying them
 * requires choosing which event first. Navigating updates `?evento=` and the
 * server component reloads the payables read-only.
 */
export function EventPayoutSelect({
  events,
  selectedId,
}: {
  events: { id: string; title: string }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function pick(eventId: string) {
    const next = new URLSearchParams(params);
    if (eventId) next.set("evento", eventId);
    else next.delete("evento");
    router.push(`?${next.toString()}`);
  }

  return (
    <Field label="Evento" htmlFor="payout-event">
      <Select
        id="payout-event"
        value={selectedId ?? ""}
        onChange={(e) => pick(e.target.value)}
      >
        <option value="">Selecione um evento…</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.title}
          </option>
        ))}
      </Select>
    </Field>
  );
}
