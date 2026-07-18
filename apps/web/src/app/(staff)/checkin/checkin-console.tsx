"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { Button, Card, CardBody, Input } from "@/components/ui";

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
      <Card className="mt-16">
        <CardBody className="text-center text-body text-ink-soft">
          Sessão expirada.{" "}
          <a href="/entrar" className="font-semibold text-brand hover:underline">
            Entrar
          </a>
        </CardBody>
      </Card>
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
        <h1 className="flex items-center gap-2 text-h2 text-ink">
          <ScanLine className="size-5 text-brand" />
          Portaria
        </h1>
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setEventId(null);
            setResult(null);
          }}
        >
          Trocar evento
        </Button>
      </header>

      {dashboard && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Presentes" value={dashboard.present} />
          <MiniStat label="Ausentes" value={dashboard.absent} />
          <MiniStat label="Entrada" value={`${dashboard.entryRatePercent}%`} />
        </div>
      )}

      {result && (
        <div
          role="status"
          className={
            result.accepted
              ? "rounded-xl border border-success-border bg-success-bg p-5 text-center"
              : "rounded-xl border border-danger-border bg-danger-bg p-5 text-center"
          }
        >
          <p
            className={
              result.accepted
                ? "flex items-center justify-center gap-2 text-h1 font-extrabold text-success-text"
                : "flex items-center justify-center gap-2 text-h1 font-extrabold text-danger-text"
            }
          >
            {result.accepted ? (
              <CheckCircle2 className="size-7" />
            ) : (
              <XCircle className="size-7" />
            )}
            {result.accepted ? "ENTRADA LIBERADA" : "RECUSADO"}
          </p>
          {result.accepted && result.ticket?.participantName && (
            <p className="mt-1 text-body text-success-text">{result.ticket.participantName}</p>
          )}
          {!result.accepted && (
            <p className="mt-1 text-body text-danger-text">
              {REASON_LABEL[result.reason ?? ""] ?? "Ingresso inválido"}
            </p>
          )}
        </div>
      )}

      <Card>
        <CardBody>
          <label htmlFor="ci-token" className="mb-1.5 block text-small font-medium text-ink-soft">
            Código do ingresso (QR)
          </label>
          <div className="flex gap-2">
            <Input
              id="ci-token"
              ref={inputRef}
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              placeholder="Escaneie ou cole o código"
              onKeyDown={(e) => {
                if (e.key === "Enter") void validate();
              }}
            />
            <Button
              loading={busy}
              disabled={token.trim().length === 0}
              onClick={() => void validate()}
            >
              Validar
            </Button>
          </div>
          <p className="mt-2 text-small text-ink-muted">
            Leitura por câmera e modo offline são aprimoramentos futuros — a validação online já usa
            a mesma API.
          </p>
        </CardBody>
      </Card>
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
      <h1 className="text-h2 text-ink">{title}</h1>
      {items.length === 0 ? (
        <p className="text-body text-ink-muted">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function PickerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-line bg-surface p-4 text-left font-medium text-ink transition-colors hover:bg-hover"
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 text-center">
      <p className="text-h2 font-bold tabular-nums text-ink">{value}</p>
      <p className="text-small text-ink-muted">{label}</p>
    </div>
  );
}
