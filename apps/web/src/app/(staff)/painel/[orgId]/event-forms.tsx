"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/ui";
import { AddressFields, addressToPayload, emptyAddress, type AddressValue } from "../address-fields";

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
  startsAt: "",
  capacityTotal: "",
};

export function NewEventForm({
  orgId,
  orgSlug,
  label = "Novo evento",
}: {
  orgId: string;
  orgSlug: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
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
      };
      Object.assign(body, addressToPayload(address));
      if (form.startsAt) body.startsAt = new Date(form.startsAt).toISOString();
      if (form.capacityTotal) body.capacityTotal = Number(form.capacityTotal);

      const res = await fetch(`/api/orgs/${orgId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; slug?: string; error?: string };
      if (!res.ok || !data.slug) {
        setError(data.error ?? "Não foi possível criar o evento.");
        return;
      }
      router.push(`/painel/${orgSlug}/eventos/${data.slug}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button leftIcon={<Plus className="size-[18px]" />} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
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

          <AddressFields value={address} onChange={setAddress} />

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

          {error && <p className="text-small text-danger">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
