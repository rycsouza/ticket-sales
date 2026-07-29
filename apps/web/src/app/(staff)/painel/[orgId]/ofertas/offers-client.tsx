"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Tag } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  Select,
} from "@/components/ui";
import { fmtBRL } from "@/lib/status";

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  active: boolean;
};

type Offer = {
  id: string;
  kind: "ORDER_BUMP" | "UPSELL";
  eventId: string | null;
  batchId: string | null;
  productId: string | null;
  title: string | null;
  description: string | null;
  priceCentsOverride: number | null;
  active: boolean;
  sortOrder: number;
};

type EventWithBatches = {
  id: string;
  title: string;
  batches: { id: string; name: string; priceCents: number; status: string }[];
};

const KIND_LABEL: Record<Offer["kind"], string> = {
  ORDER_BUMP: "Order bump",
  UPSELL: "Upsell",
};

export function OffersManager({
  orgId,
  products,
  offers,
  events,
}: {
  orgId: string;
  products: Product[];
  offers: Offer[];
  events: EventWithBatches[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Não foi possível concluir a operação.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const productName = (id: string | null) =>
    products.find((p) => p.id === id)?.name ?? "Produto removido";
  const eventTitle = (id: string | null) =>
    id === null ? "Todos os eventos" : (events.find((e) => e.id === id)?.title ?? "Evento");
  const batchLabel = (id: string | null) => {
    for (const ev of events) {
      const b = ev.batches.find((x) => x.id === id);
      if (b) return `${ev.title} · ${b.name}`;
    }
    return "Lote removido";
  };

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-body text-danger-text">
          {error}
        </p>
      )}

      <Card>
        <CardHeader
          title="Produtos"
          description="Itens avulsos pagos (sem ingresso/QR) que podem virar ofertas."
        />
        <CardBody className="space-y-4">
          {products.length === 0 ? (
            <EmptyState
              icon={<Tag className="size-5" />}
              title="Nenhum produto ainda"
              description="Crie um produto para oferecê-lo como upsell ou order bump."
            />
          ) : (
            <ul className="divide-y divide-line">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{p.name}</span>
                    {p.description && (
                      <span className="block truncate text-small text-ink-muted">{p.description}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular-nums text-ink">{fmtBRL(p.priceCents)}</span>
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void call(`/api/orgs/${orgId}/products/${p.id}`, "PATCH", { active: !p.active })
                      }
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NewProductForm orgId={orgId} busy={busy} onSubmit={call} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ofertas"
          description="Upsell (após escolher ingressos) e order bump (no resumo). Vincule a um evento ou deixe para todos."
        />
        <CardBody className="space-y-4">
          {offers.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-5" />}
              title="Nenhuma oferta ainda"
              description="Crie uma oferta apontando para um produto ou um lote de ingresso."
            />
          ) : (
            <ul className="divide-y divide-line">
              {offers.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">
                      {o.title ?? (o.productId ? productName(o.productId) : "Ingresso adicional")}
                    </span>
                    <span className="block truncate text-small text-ink-muted">
                      {o.productId ? productName(o.productId) : batchLabel(o.batchId)} ·{" "}
                      {eventTitle(o.eventId)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tone="neutral">{KIND_LABEL[o.kind]}</Badge>
                    {o.priceCentsOverride !== null && (
                      <span className="tabular-nums text-ink">{fmtBRL(o.priceCentsOverride)}</span>
                    )}
                    <Badge tone={o.active ? "success" : "neutral"}>{o.active ? "Ativa" : "Inativa"}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void call(`/api/orgs/${orgId}/offers/${o.id}`, "PATCH", { active: !o.active })
                      }
                    >
                      {o.active ? "Desativar" : "Ativar"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NewOfferForm orgId={orgId} busy={busy} products={products} events={events} onSubmit={call} />
        </CardBody>
      </Card>
    </div>
  );
}

function NewProductForm({
  orgId,
  busy,
  onSubmit,
}: {
  orgId: string;
  busy: boolean;
  onSubmit: (url: string, method: string, body: unknown) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState<number | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit(`/api/orgs/${orgId}/products`, "POST", {
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          priceCents: priceCents ?? 0,
        });
        if (ok) {
          setName("");
          setDescription("");
          setPriceCents(null);
        }
      }}
    >
      <Field label="Nome" htmlFor="np-name">
        <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Copo oficial" />
      </Field>
      <Field label="Descrição (opcional)" htmlFor="np-desc">
        <Input id="np-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Copo colecionável do evento" />
      </Field>
      <Field label="Preço" htmlFor="np-price">
        <MoneyInput id="np-price" valueCents={priceCents} onChangeCents={setPriceCents} />
      </Field>
      <Button type="submit" loading={busy} disabled={name.trim().length < 2 || !priceCents} leftIcon={<Plus className="size-[18px]" />}>
        Adicionar
      </Button>
    </form>
  );
}

function NewOfferForm({
  orgId,
  busy,
  products,
  events,
  onSubmit,
}: {
  orgId: string;
  busy: boolean;
  products: Product[];
  events: EventWithBatches[];
  onSubmit: (url: string, method: string, body: unknown) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<"ORDER_BUMP" | "UPSELL">("ORDER_BUMP");
  const [targetType, setTargetType] = useState<"product" | "batch">("product");
  const [productId, setProductId] = useState("");
  const [eventId, setEventId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [scope, setScope] = useState<"all" | "event">("all");
  const [scopeEventId, setScopeEventId] = useState("");
  const [title, setTitle] = useState("");
  const [priceCents, setPriceCents] = useState<number | null>(null);

  const activeProducts = products.filter((p) => p.active);
  const selectedEvent = events.find((e) => e.id === eventId);

  const canSubmit =
    targetType === "product" ? productId !== "" : eventId !== "" && batchId !== "";

  return (
    <form
      className="space-y-3 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { kind, ...(title.trim() ? { title: title.trim() } : {}) };
        if (priceCents !== null) body.priceCentsOverride = priceCents;
        if (targetType === "product") {
          body.productId = productId;
          if (scope === "event" && scopeEventId) body.eventId = scopeEventId;
        } else {
          body.batchId = batchId; // event is derived server-side from the batch
        }
        const ok = await onSubmit(`/api/orgs/${orgId}/offers`, "POST", body);
        if (ok) {
          setProductId("");
          setBatchId("");
          setTitle("");
          setPriceCents(null);
        }
      }}
    >
      <p className="text-small font-semibold uppercase tracking-wide text-ink-muted">Nova oferta</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="no-kind">
          <Select id="no-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="ORDER_BUMP">Order bump (no resumo)</option>
            <option value="UPSELL">Upsell (após escolher ingressos)</option>
          </Select>
        </Field>
        <Field label="O que oferecer" htmlFor="no-target">
          <Select
            id="no-target"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as "product" | "batch")}
          >
            <option value="product">Produto avulso</option>
            <option value="batch">Ingresso (lote existente)</option>
          </Select>
        </Field>
      </div>

      {targetType === "product" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Produto" htmlFor="no-product">
            <Select id="no-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione…</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {fmtBRL(p.priceCents)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Onde aparece" htmlFor="no-scope">
            <Select
              id="no-scope"
              value={scope === "all" ? "all" : scopeEventId}
              onChange={(e) => {
                if (e.target.value === "all") {
                  setScope("all");
                } else {
                  setScope("event");
                  setScopeEventId(e.target.value);
                }
              }}
            >
              <option value="all">Todos os eventos</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Evento" htmlFor="no-event">
            <Select
              id="no-event"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setBatchId("");
              }}
            >
              <option value="">Selecione…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lote" htmlFor="no-batch">
            <Select
              id="no-batch"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              disabled={!selectedEvent}
            >
              <option value="">Selecione…</option>
              {selectedEvent?.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {fmtBRL(b.priceCents)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Título (opcional)" htmlFor="no-title" hint="Chamada exibida ao comprador.">
          <Input
            id="no-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leve também o copo oficial"
          />
        </Field>
        <Field label="Preço da oferta (opcional)" htmlFor="no-price" hint="Vazio = preço do alvo.">
          <MoneyInput id="no-price" valueCents={priceCents} onChangeCents={setPriceCents} />
        </Field>
      </div>

      <Button type="submit" loading={busy} disabled={!canSubmit} leftIcon={<Plus className="size-[18px]" />}>
        Criar oferta
      </Button>
    </form>
  );
}
