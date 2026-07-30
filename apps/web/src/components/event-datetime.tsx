"use client";

import { useEffect, useState } from "react";

/**
 * Datas/horários de evento exibidos no FUSO DO COMPRADOR (dispositivo), com
 * disclaimer explícito. SSR e primeiro paint usam o fuso do evento (igual ao
 * HTML do servidor — sem hydration mismatch); após montar, converte para o
 * fuso local do visitante.
 */

function useViewerZone(eventTimezone: string): { zone: string; isViewer: boolean } {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* mantém o fuso do evento */
    }
  }, []);
  return { zone: zone ?? eventTimezone, isViewer: zone !== null };
}

function gmtLabel(date: Date, zone: string): string {
  const part = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? zone;
}

export function EventDateTime({
  date,
  eventTimezone,
  prefix,
}: {
  date: Date | string | null;
  eventTimezone: string;
  prefix?: string | undefined;
}) {
  const { zone } = useViewerZone(eventTimezone);
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const label = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: zone,
  }).format(d);
  return (
    <>
      {prefix ? `${prefix}: ` : ""}
      {label}
    </>
  );
}

/** Aviso explícito de qual fuso está sendo exibido (pede o PRD de clareza). */
export function TimezoneDisclaimer({
  eventTimezone,
  reference,
  className,
}: {
  eventTimezone: string;
  /** Data de referência p/ resolver o offset (DST-safe); default = agora. */
  reference?: Date | string | null;
  className?: string;
}) {
  const { zone, isViewer } = useViewerZone(eventTimezone);
  const ref = reference ? new Date(reference) : new Date();
  const sameAsEvent = zone === eventTimezone;
  return (
    <p className={className ?? "text-caption text-ink-faint"}>
      Horários no fuso {isViewer && !sameAsEvent ? "do seu dispositivo" : "local do evento"}:{" "}
      {gmtLabel(ref, zone)} ({zone.replace(/_/g, " ")})
    </p>
  );
}
