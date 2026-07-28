"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, ScanLine, Wifi, WifiOff, XCircle } from "lucide-react";
import { Button, Card, CardBody, Input } from "@/components/ui";
import { QrScanner } from "./qr-scanner";
import {
  getDeviceId,
  getPackInfo,
  getQueue,
  removeFromQueue,
  savePack,
  clearUsedHash,
  validateLocally,
} from "./checkin-offline";

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
  offline?: boolean;
}

const REASON_LABEL: Record<string, string> = {
  not_found: "Ingresso não encontrado",
  not_found_offline: "Não está na lista offline — reconecte para confirmar",
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
  const [scanning, setScanning] = useState(false);
  const [online, setOnline] = useState(true);
  const [pack, setPack] = useState<{ version: string; count: number } | null>(null);
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deviceId = useRef<string>("");
  const syncing = useRef(false);

  // Register the portaria service worker (scoped to /checkin) for warm offline.
  // Production only — the dev server's chunks aren't stable enough to cache.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/checkin-sw.js", { scope: "/checkin" }).catch(() => {});
  }, []);

  useEffect(() => {
    deviceId.current = getDeviceId();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

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
    if (!orgId || !eventId || !navigator.onLine) return;
    const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/dashboard`);
    if (res.ok) setDashboard((await res.json()) as Dashboard);
  }, [orgId, eventId]);

  // Pull the offline pack — primes local validation and refreshes the counts.
  const downloadPack = useCallback(async () => {
    if (!orgId || !eventId) return;
    const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/pack`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      version: string;
      tickets: { tokenHash: string; participantName: string | null }[];
    };
    savePack(eventId, data);
    setPack(getPackInfo(eventId));
  }, [orgId, eventId]);

  // Sync queued offline admissions; reconcile applied/duplicate/conflict.
  const syncQueue = useCallback(async () => {
    if (!orgId || !eventId || syncing.current || !navigator.onLine) return;
    const queue = getQueue(eventId);
    if (queue.length === 0) return;
    syncing.current = true;
    try {
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: deviceId.current,
          items: queue.map((q) => ({ token: q.token, checkedInAt: q.checkedInAt })),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        results: { token: string; outcome: string }[];
      };
      const byToken = new Map(queue.map((q) => [q.token, q]));
      let conflicts = 0;
      const settled: string[] = [];
      for (const r of data.results) {
        settled.push(r.token);
        if (r.outcome === "conflict") {
          conflicts += 1;
          const q = byToken.get(r.token);
          if (q) clearUsedHash(eventId, q.tokenHash); // it was admitted elsewhere
        }
      }
      removeFromQueue(eventId, settled);
      setPending(getQueue(eventId).length);
      setSyncMsg(
        conflicts > 0
          ? `${settled.length} sincronizados · ${conflicts} já usados em outro aparelho`
          : `${settled.length} check-ins sincronizados`,
      );
      void refreshDashboard();
    } finally {
      syncing.current = false;
    }
  }, [orgId, eventId, refreshDashboard]);

  // On entering an event: load dashboard, prime the pack, sync any leftovers.
  useEffect(() => {
    if (!eventId) return;
    setPack(getPackInfo(eventId));
    setPending(getQueue(eventId).length);
    void refreshDashboard();
    if (navigator.onLine) {
      void downloadPack();
      void syncQueue();
    }
  }, [eventId, refreshDashboard, downloadPack, syncQueue]);

  // Auto-sync whenever connectivity returns.
  useEffect(() => {
    if (online) void syncQueue();
  }, [online, syncQueue]);

  const admitLocally = useCallback(
    async (raw: string) => {
      if (!eventId) return;
      const local = await validateLocally(eventId, raw);
      setPending(getQueue(eventId).length);
      if (local.outcome === "accepted") {
        setResult({ accepted: true, offline: true, ticket: { participantName: local.participantName } });
      } else {
        setResult({
          accepted: false,
          offline: true,
          reason: local.outcome === "already_checked_in" ? "already_checked_in" : "not_found_offline",
          ticket: { participantName: local.participantName },
        });
      }
    },
    [eventId],
  );

  const admit = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!orgId || !eventId || value.length === 0 || busy) return;
      setBusy(true);
      setResult(null);
      setSyncMsg(null);
      try {
        if (navigator.onLine) {
          try {
            const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/checkin/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: value, deviceId: deviceId.current }),
            });
            if (res.status === 401) {
              setAuthError(true);
              return;
            }
            if (res.ok) {
              setResult((await res.json()) as ValidationResult);
              void refreshDashboard();
              return;
            }
          } catch {
            // Network dropped mid-scan — fall back to the offline pack.
          }
        }
        await admitLocally(value);
      } finally {
        setBusy(false);
        setToken("");
        inputRef.current?.focus();
      }
    },
    [orgId, eventId, busy, refreshDashboard, admitLocally],
  );

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
        <div className="flex items-center gap-3">
          <span
            className={
              online
                ? "flex items-center gap-1 text-small font-medium text-success"
                : "flex items-center gap-1 text-small font-medium text-warning-text"
            }
            title={online ? "Online" : "Offline — validando pela lista baixada"}
          >
            {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {online ? "Online" : "Offline"}
          </span>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setEventId(null);
              setResult(null);
              setScanning(false);
            }}
          >
            Trocar evento
          </Button>
        </div>
      </header>

      {dashboard && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Presentes" value={dashboard.present} />
          <MiniStat label="Ausentes" value={dashboard.absent} />
          <MiniStat label="Entrada" value={`${dashboard.entryRatePercent}%`} />
        </div>
      )}

      {(pending > 0 || syncMsg) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-small">
          <span className="text-ink-soft">
            {pending > 0 ? `${pending} check-in(s) pendentes de envio` : syncMsg}
          </span>
          {pending > 0 && online && (
            <Button variant="outline" size="sm" onClick={() => void syncQueue()}>
              Sincronizar
            </Button>
          )}
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
            {result.accepted ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
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
          {result.offline && (
            <p className="mt-1 text-small text-ink-muted">Validado offline · será sincronizado</p>
          )}
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          {scanning ? (
            <QrScanner active onScan={(v) => void admit(v)} />
          ) : null}
          <Button
            variant={scanning ? "outline" : "primary"}
            className="w-full"
            leftIcon={<ScanLine className="size-[18px]" />}
            onClick={() => setScanning((s) => !s)}
          >
            {scanning ? "Parar câmera" : "Escanear com a câmera"}
          </Button>

          <div className="flex items-center gap-2 text-small text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            ou digite o código
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="flex gap-2">
            <Input
              id="ci-token"
              ref={inputRef}
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cole o código do ingresso"
              onKeyDown={(e) => {
                if (e.key === "Enter") void admit(token);
              }}
            />
            <Button loading={busy} disabled={token.trim().length === 0} onClick={() => void admit(token)}>
              Validar
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink-muted">
        <span>
          {pack ? `Lista offline: ${pack.count} ingresso(s)` : "Sem lista offline baixada"}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!online}
          leftIcon={<Download className="size-4" />}
          onClick={() => void downloadPack()}
        >
          Atualizar lista
        </Button>
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
