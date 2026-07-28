"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button, Field, Input, MoneyInput, Modal, Select } from "@/components/ui";

function useSubmit(onOk: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(url: string, body: unknown, method: "POST" | "PATCH" = "POST") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível concluir a operação.");
        return false;
      }
      onOk();
      return true;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, send, setError };
}

export function NewTicketTypeForm({ orgId, eventId }: { orgId: string; eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { busy, error, send } = useSubmit(() => {
    setName("");
    setOpen(false);
    router.refresh();
  });

  function submit() {
    // "kind" is an internal classification (reports/rules); the producer no
    // longer picks it — every type defaults to FULL until we need otherwise.
    void send(`/api/orgs/${orgId}/events/${eventId}/ticket-types`, { name: name.trim(), kind: "FULL" });
  }

  const nameTooShort = name.trim().length === 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Plus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Criar ingresso
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo tipo de ingresso"
        description="O tipo define o produto vendido (ex.: Pista, Camarote). O preço e a quantidade ficam nos lotes."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={nameTooShort} onClick={submit}>
              Criar ingresso
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Nome" htmlFor="tt-name" hint="Como aparece no checkout. Ex.: Pista, Camarote, Mesa VIP.">
            <Input
              id="tt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Pista"
              autoFocus
            />
          </Field>
          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

const emptyBatch = {
  name: "",
  priceCents: null as number | null,
  quantityTotal: "",
  maxPerOrder: "",
  salesStartAt: "",
  salesEndAt: "",
};

export function NewBatchForm({
  orgId,
  eventId,
  ticketTypes,
  lockedTicketTypeId,
  triggerLabel = "Criar lote",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  orgId: string;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
  lockedTicketTypeId?: string;
  triggerLabel?: string;
  triggerVariant?: "outline" | "secondary" | "ghost" | "primary";
  triggerSize?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState(
    lockedTicketTypeId ?? ticketTypes[0]?.id ?? "",
  );
  const [form, setForm] = useState(emptyBatch);
  const { busy, error, send } = useSubmit(() => {
    setForm(emptyBatch);
    setOpen(false);
    router.refresh();
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const quantity = form.quantityTotal === "" ? null : Number(form.quantityTotal);
  const limit = form.maxPerOrder === "" ? null : Number(form.maxPerOrder);
  const startMs = form.salesStartAt ? new Date(form.salesStartAt).getTime() : null;
  const endMs = form.salesEndAt ? new Date(form.salesEndAt).getTime() : null;

  // Field-level validation, mirroring createSalesBatchSchema.
  const errors: Partial<Record<"price" | "quantity" | "limit" | "dates", string>> = {};
  if (form.priceCents !== null && form.priceCents < 0) errors.price = "O preço não pode ser negativo.";
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1))
    errors.quantity = "Informe uma quantidade inteira maior que zero.";
  if (limit !== null && (!Number.isInteger(limit) || limit < 1))
    errors.limit = "O limite deve ser um número inteiro maior que zero.";
  else if (limit !== null && quantity !== null && limit > quantity)
    errors.limit = "O limite por pedido não pode ser maior que a quantidade disponível.";
  if (startMs !== null && endMs !== null && endMs <= startMs)
    errors.dates = "O encerramento deve ser depois do início das vendas.";

  const complete =
    !!ticketTypeId &&
    form.name.trim().length > 0 &&
    form.priceCents !== null &&
    quantity !== null;
  const hasErrors = Object.keys(errors).length > 0;
  const canSubmit = complete && !hasErrors;

  function submit() {
    if (!canSubmit) return;
    const body: Record<string, unknown> = {
      ticketTypeId,
      name: form.name.trim(),
      priceCents: form.priceCents,
      quantityTotal: quantity,
    };
    if (limit !== null) body.maxPerOrder = limit;
    if (form.salesStartAt) body.salesStartAt = new Date(form.salesStartAt).toISOString();
    if (form.salesEndAt) body.salesEndAt = new Date(form.salesEndAt).toISOString();
    void send(`/api/orgs/${orgId}/events/${eventId}/batches`, body);
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        leftIcon={<Plus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo lote"
        description="Um lote define preço, quantidade e período de venda de um tipo de ingresso."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={!canSubmit} onClick={submit}>
              Criar lote
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {lockedTicketTypeId ? (
            <Field label="Tipo de ingresso" hint="Selecionado pelo ingresso escolhido.">
              <Input
                readOnly
                value={ticketTypes.find((t) => t.id === lockedTicketTypeId)?.name ?? "Ingresso"}
              />
            </Field>
          ) : (
            <Field label="Tipo de ingresso" htmlFor="b-type">
              <Select id="b-type" value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)}>
                {ticketTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Nome do lote" htmlFor="b-name">
            <Input
              id="b-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex.: 1º Lote"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Preço" htmlFor="b-price" error={errors.price}>
              <MoneyInput
                id="b-price"
                valueCents={form.priceCents}
                onChangeCents={(c) => set("priceCents", c)}
                ariaInvalid={!!errors.price}
              />
            </Field>
            <Field label="Quantidade disponível" htmlFor="b-qty" error={errors.quantity}>
              <Input
                id="b-qty"
                type="number"
                min={1}
                step={1}
                value={form.quantityTotal}
                onChange={(e) => set("quantityTotal", e.target.value)}
                aria-invalid={!!errors.quantity}
                placeholder="Ex.: 200"
              />
            </Field>
          </div>

          <Field
            label="Limite por pedido"
            htmlFor="b-max"
            error={errors.limit}
            hint={errors.limit ? undefined : "Opcional. Deixe em branco para não limitar."}
          >
            <Input
              id="b-max"
              type="number"
              min={1}
              step={1}
              value={form.maxPerOrder}
              onChange={(e) => set("maxPerOrder", e.target.value)}
              aria-invalid={!!errors.limit}
              placeholder="Sem limite"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Início das vendas" htmlFor="b-start" hint="Opcional.">
              <Input
                id="b-start"
                type="datetime-local"
                value={form.salesStartAt}
                onChange={(e) => set("salesStartAt", e.target.value)}
              />
            </Field>
            <Field label="Encerramento das vendas" htmlFor="b-end" error={errors.dates} hint={errors.dates ? undefined : "Opcional."}>
              <Input
                id="b-end"
                type="datetime-local"
                value={form.salesEndAt}
                onChange={(e) => set("salesEndAt", e.target.value)}
                aria-invalid={!!errors.dates}
              />
            </Field>
          </div>

          {error && <p className="text-small text-danger">{error}</p>}
          {complete && hasErrors && (
            <p className="text-small text-ink-muted">Corrija os campos destacados para continuar.</p>
          )}
        </form>
      </Modal>
    </>
  );
}

/** ISO → value for a <input type="datetime-local"> in the viewer's local time. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Rename a ticket type / toggle its visibility on the sales page. */
export function EditTicketTypeButton({
  orgId,
  eventId,
  ticketType,
}: {
  orgId: string;
  eventId: string;
  ticketType: { id: string; name: string; active: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(ticketType.name);
  const [active, setActive] = useState(ticketType.active);
  const { busy, error, send } = useSubmit(() => {
    setOpen(false);
    router.refresh();
  });

  function submit() {
    void send(
      `/api/orgs/${orgId}/events/${eventId}/ticket-types/${ticketType.id}`,
      { name: name.trim(), active },
      "PATCH",
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Pencil className="size-4" />}
        onClick={() => {
          setName(ticketType.name);
          setActive(ticketType.active);
          setOpen(true);
        }}
      >
        Editar
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar ingresso"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={name.trim().length === 0} onClick={submit}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Nome" htmlFor="ett-name">
            <Input id="ett-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <label className="flex items-center gap-2 text-body text-ink-soft">
            <input
              type="checkbox"
              checked={!active}
              onChange={(e) => setActive(!e.target.checked)}
              className="size-4"
            />
            Ocultar da página de vendas
          </label>
          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

/** Edit a batch: name, price, quantity, per-order cap and sales window. */
export function EditBatchButton({
  orgId,
  batch,
}: {
  orgId: string;
  batch: {
    id: string;
    name: string;
    priceCents: number;
    quantityTotal: number;
    maxPerOrder: number | null;
    salesStartAt: string | null;
    salesEndAt: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(batch.name);
  const [priceCents, setPriceCents] = useState<number | null>(batch.priceCents);
  const [quantityTotal, setQuantityTotal] = useState(String(batch.quantityTotal));
  const [maxPerOrder, setMaxPerOrder] = useState(batch.maxPerOrder ? String(batch.maxPerOrder) : "");
  const [salesStartAt, setSalesStartAt] = useState(toLocalInput(batch.salesStartAt));
  const [salesEndAt, setSalesEndAt] = useState(toLocalInput(batch.salesEndAt));
  const [justification, setJustification] = useState("");
  const { busy, error, send } = useSubmit(() => {
    setOpen(false);
    router.refresh();
  });

  const qty = quantityTotal === "" ? null : Number(quantityTotal);
  const quantityChanged = qty !== null && qty !== batch.quantityTotal;
  const canSubmit = name.trim().length > 0 && priceCents !== null && qty !== null && qty >= 1;

  function submit() {
    if (!canSubmit) return;
    const body: Record<string, unknown> = {
      name: name.trim(),
      priceCents,
      quantityTotal: qty,
      maxPerOrder: maxPerOrder === "" ? null : Number(maxPerOrder),
      salesStartAt: salesStartAt ? new Date(salesStartAt).toISOString() : null,
      salesEndAt: salesEndAt ? new Date(salesEndAt).toISOString() : null,
    };
    if (justification.trim()) body.justification = justification.trim();
    void send(`/api/orgs/${orgId}/batches/${batch.id}`, body, "PATCH");
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Pencil className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Editar
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar lote"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={!canSubmit} onClick={submit}>
              Salvar
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Nome do lote" htmlFor="eb-name">
            <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Preço" htmlFor="eb-price">
              <MoneyInput id="eb-price" valueCents={priceCents} onChangeCents={setPriceCents} />
            </Field>
            <Field
              label="Quantidade"
              htmlFor="eb-qty"
              hint="Não pode ficar abaixo do já vendido/reservado."
            >
              <Input
                id="eb-qty"
                type="number"
                min={1}
                step={1}
                value={quantityTotal}
                onChange={(e) => setQuantityTotal(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Limite por pedido" htmlFor="eb-max" hint="Opcional. Vazio = sem limite.">
            <Input
              id="eb-max"
              type="number"
              min={1}
              step={1}
              value={maxPerOrder}
              onChange={(e) => setMaxPerOrder(e.target.value)}
              placeholder="Sem limite"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Início das vendas" htmlFor="eb-start" hint="Opcional.">
              <Input
                id="eb-start"
                type="datetime-local"
                value={salesStartAt}
                onChange={(e) => setSalesStartAt(e.target.value)}
              />
            </Field>
            <Field label="Encerramento" htmlFor="eb-end" hint="Opcional.">
              <Input
                id="eb-end"
                type="datetime-local"
                value={salesEndAt}
                onChange={(e) => setSalesEndAt(e.target.value)}
              />
            </Field>
          </div>
          {quantityChanged && (
            <Field
              label="Justificativa"
              htmlFor="eb-just"
              hint="Necessária ao mudar a quantidade após o início das vendas."
            >
              <Input
                id="eb-just"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex.: liberação de mais 50 lugares"
              />
            </Field>
          )}
          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
