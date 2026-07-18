"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "@/components/ui";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const EMPTY = {
  title: "",
  venueName: "",
  city: "",
  state: "",
  startsAt: "",
  capacityTotal: "",
  feePercent: "10",
  feeMode: "PRODUCER",
};

export function NewEventForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        slug: slugify(form.title),
        feeMode: form.feeMode,
        platformFeeBps: Math.round(Number(form.feePercent) * 100),
      };
      if (form.venueName.trim()) body.venueName = form.venueName.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.state.trim()) body.state = form.state.trim().toUpperCase();
      if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
      if (form.capacityTotal) body.capacityTotal = Number(form.capacityTotal);

      const res = await fetch(`/api/orgs/${orgId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Não foi possível criar o evento.");
        return;
      }
      router.push(`/painel/${orgId}/eventos/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button leftIcon={<Plus className="size-[18px]" />} onClick={() => setOpen(true)}>
        Novo evento
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo evento"
        description="Você poderá publicar e ajustar tudo depois."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              disabled={form.title.trim().length < 3}
            >
              Criar evento
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            label="Título"
            htmlFor="ev-title"
            hint={form.title ? `/${slugify(form.title)}` : undefined}
          >
            <Input
              id="ev-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Festa de Verão"
            />
          </Field>

          <Field label="Local" htmlFor="ev-venue">
            <Input
              id="ev-venue"
              value={form.venueName}
              onChange={(e) => set("venueName", e.target.value)}
              placeholder="Clube da Cidade"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Cidade" htmlFor="ev-city" className="col-span-2">
              <Input id="ev-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="UF" htmlFor="ev-uf">
              <Input
                id="ev-uf"
                maxLength={2}
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" htmlFor="ev-start">
              <Input
                id="ev-start"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Capacidade" htmlFor="ev-cap">
              <Input
                id="ev-cap"
                type="number"
                min={1}
                value={form.capacityTotal}
                onChange={(e) => set("capacityTotal", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Taxa (%)" htmlFor="ev-fee">
              <Input
                id="ev-fee"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.feePercent}
                onChange={(e) => set("feePercent", e.target.value)}
              />
            </Field>
            <Field label="Quem paga a taxa" htmlFor="ev-feemode">
              <Select
                id="ev-feemode"
                value={form.feeMode}
                onChange={(e) => set("feeMode", e.target.value)}
              >
                <option value="PRODUCER">Produtora (deduz do repasse)</option>
                <option value="BUYER">Comprador (soma ao total)</option>
              </Select>
            </Field>
          </div>

          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
