"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

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
        setError(data.error ?? "Falha na operação.");
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
  const [kind, setKind] = useState("FULL");
  const { busy, error, send } = useSubmit(() => {
    setName("");
    setOpen(false);
    router.refresh();
  });

  function submit() {
    void send(`/api/orgs/${orgId}/events/${eventId}/ticket-types`, { name: name.trim(), kind });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Plus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Novo tipo
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo tipo de ingresso"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={name.trim().length === 0} onClick={submit}>
              Adicionar
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
          <Field label="Nome" htmlFor="tt-name">
            <Input
              id="tt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Pista"
            />
          </Field>
          <Field label="Tipo" htmlFor="tt-kind">
            <Select id="tt-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="FULL">Inteira</option>
              <option value="HALF">Meia</option>
              <option value="PROMOTIONAL">Promocional</option>
              <option value="COURTESY">Cortesia</option>
              <option value="CUSTOM">Personalizada</option>
            </Select>
          </Field>
          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}

export function NewBatchForm({
  orgId,
  eventId,
  ticketTypes,
}: {
  orgId: string;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ticketTypeId: ticketTypes[0]?.id ?? "",
    name: "",
    price: "",
    quantityTotal: "",
    maxPerOrder: "",
  });
  const { busy, error, send } = useSubmit(() => {
    setForm((f) => ({ ...f, name: "", price: "", quantityTotal: "", maxPerOrder: "" }));
    setOpen(false);
    router.refresh();
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    const body: Record<string, unknown> = {
      ticketTypeId: form.ticketTypeId,
      name: form.name.trim(),
      priceCents: Math.round(Number(form.price) * 100),
      quantityTotal: Number(form.quantityTotal),
    };
    if (form.maxPerOrder) body.maxPerOrder = Number(form.maxPerOrder);
    void send(`/api/orgs/${orgId}/events/${eventId}/batches`, body);
  }

  const invalid =
    !form.ticketTypeId || form.name.trim().length === 0 || !form.price || !form.quantityTotal;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Plus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Novo lote
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo lote"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={invalid} onClick={submit}>
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
          <Field label="Tipo de ingresso" htmlFor="b-type">
            <Select
              id="b-type"
              value={form.ticketTypeId}
              onChange={(e) => set("ticketTypeId", e.target.value)}
            >
              {ticketTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nome do lote" htmlFor="b-name">
            <Input
              id="b-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex.: 1º Lote"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Preço (R$)" htmlFor="b-price">
              <Input
                id="b-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
            <Field label="Qtd" htmlFor="b-qty">
              <Input
                id="b-qty"
                type="number"
                min={1}
                value={form.quantityTotal}
                onChange={(e) => set("quantityTotal", e.target.value)}
              />
            </Field>
            <Field label="Máx/pedido" htmlFor="b-max">
              <Input
                id="b-max"
                type="number"
                min={1}
                value={form.maxPerOrder}
                onChange={(e) => set("maxPerOrder", e.target.value)}
              />
            </Field>
          </div>
          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
