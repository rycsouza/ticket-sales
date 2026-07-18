"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Org {
  id: string;
  name: string;
  role: string;
}
interface EventItem {
  id: string;
  title: string;
  status: string;
}
interface Dashboard {
  sold: number;
  present: number;
  absent: number;
  entryRatePercent: number;
}
interface ValidationResult {
  accepted: boolean;
  reason?: string;
  ticket?: { participantName: string | null };
  existingCheckin?: { checkedInAt: string };
}

const REASON_LABEL: Record<string, string> = {
  not_found: "Ingresso não encontrado",
  wrong_event: "Ingresso de outro evento",
  not_issued: "Ingresso não emitido",
  blocked: "Ingresso bloqueado",
  cancelled: "Ingresso cancelado",
  refunded: "Ingresso reembolsado",
  already_checked_in: "Já utilizado",
};

export function CheckinConsole() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  const [token, setToken] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Who am I / which orgs
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      const data = (await res.json()) as { organizations: Org[] };
      setOrgs(data.organizations);
      if (data.organizations.length === 1) setOrgId(data.organizations[0]!.id);
    })();
  }, []);

  // Events for the chosen org
  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      const res = await fetch(`/api/orgs/${orgId}/events`);
      if (!res.ok) return;
      const data = (await res.json()) as { events: EventItem[] };
      setEvents(data.events);
    })();
  }, [orgId]);

  const refreshDashboard = useCallback(async () => {
    if (!orgId || !eventId) return;
    const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/dashboard`);
    if (res.ok) setDashboard((await res.json()) as Dashboard);
  }, [orgId, eventId]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  async function validate() {
    if (!orgId || !eventId || token.trim().length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      setResult((await res.json()) as ValidationResult);
      setToken("");
      inputRef.current?.focus();
      void refreshDashboard();
    } finally {
      setBusy(false);
    }
  }

  if (authError) {
    return (
      <div className="mt-16 rounded-xl bg-white p-6 text-center text-sm text-ink-600 shadow-sm">
        Sessão expirada.{" "}
        <a href="/entrar" className="font-semibold text-brand-600 underline">
          Entrar
        </a>
      </div>
    );
  }

  if (!orgId) {
    return (
      <Picker title="Organização" empty="Nenhuma organização.">
        {(orgs ?? []).map((o) => (
          <PickerButton key={o.id} onClick={() => setOrgId(o.id)}>
            {o.name}
          </PickerButton>
        ))}
      </Picker>
    );
  }

  if (!eventId) {
    return (
      <Picker title="Evento" empty="Nenhum evento.">
        {events.map((e) => (
          <PickerButton key={e.id} onClick={() => setEventId(e.id)}>
            {e.title}
          </PickerButton>
        ))}
      </Picker>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink-900">Portaria</h1>
        <button
          type="button"
          onClick={() => {
            setEventId(null);
            setResult(null);
          }}
          className="text-sm font-medium text-brand-600"
        >
          Trocar evento
        </button>
      </header>

      {dashboard && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Presentes" value={dashboard.present} />
          <Stat label="Ausentes" value={dashboard.absent} />
          <Stat label="Entrada" value={`${dashboard.entryRatePercent}%`} />
        </div>
      )}

      {result && (
        <div
          role="status"
          className={`rounded-xl p-5 text-center ${
            result.accepted ? "bg-green-50" : "bg-red-50"
          }`}
        >
          <p
            className={`text-2xl font-extrabold ${
              result.accepted ? "text-green-700" : "text-red-700"
            }`}
          >
            {result.accepted ? "✓ ENTRADA LIBERADA" : "✕ RECUSADO"}
          </p>
          {result.accepted && result.ticket?.participantName && (
            <p className="mt-1 text-sm text-green-800">{result.ticket.participantName}</p>
          )}
          {!result.accepted && (
            <p className="mt-1 text-sm text-red-800">
              {REASON_LABEL[result.reason ?? ""] ?? "Ingresso inválido"}
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium">Código do ingresso (QR)</label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="Escaneie ou cole o código"
            onKeyDown={(e) => {
              if (e.key === "Enter") void validate();
            }}
          />
          <button
            type="button"
            onClick={() => void validate()}
            disabled={busy || token.trim().length === 0}
            className="shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
          >
            {busy ? "..." : "Validar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Leitura por câmera e modo offline são aprimoramentos futuros — a validação online já
          usa a mesma API.
        </p>
      </div>
    </div>
  );
}

function Picker({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="mt-8 space-y-3">
      <h1 className="text-lg font-bold text-ink-900">{title}</h1>
      {items.length === 0 ? (
        <p className="text-sm text-ink-400">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function PickerButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-white p-4 text-left font-medium shadow-sm active:bg-slate-50"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xl font-bold tabular-nums text-ink-900">{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  );
}
