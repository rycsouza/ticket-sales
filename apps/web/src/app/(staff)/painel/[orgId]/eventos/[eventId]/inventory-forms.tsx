"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, MoneyInput, Modal, Select } from "@/components/ui";

function useSubmit(onOk: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(url: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
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

const KIND_OPTIONS = [
  { value: "FULL", label: "Inteira" },
  { value: "HALF", label: "Meia-entrada" },
  { value: "COURTESY", label: "Cortesia" },
  { value: "PROMOTIONAL", label: "Promocional" },
  { value: "CUSTOM", label: "Personalizada" },
];

export function NewTicketTypeForm({ orgId, eventId }: { orgId: string; eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("FULL");
  const { busy, error, send } = useSubmit(() => {
    setName("");
    setKind("FULL");
    setOpen(false);
    router.refresh();
  });

  function submit() {
    void send(`/api/orgs/${orgId}/events/${eventId}/ticket-types`, { name: name.trim(), kind });
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
          <Field
            label="Categoria de preço"
            htmlFor="tt-kind"
            hint="Classificação para relatórios e regras. Não altera o preço, definido no lote."
          >
            <Select id="tt-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
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
