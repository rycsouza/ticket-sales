"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { AddressFields, addressToPayload, type AddressValue } from "../../../address-fields";

/** Inline editor for an event's venue + address (self-service, CEP autofill). */
export function EventLocationForm({
  apiBase,
  initial,
}: {
  apiBase: string;
  initial: AddressValue;
}) {
  const router = useRouter();
  const [address, setAddress] = useState<AddressValue>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressToPayload(address)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Não foi possível salvar o endereço.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AddressFields value={address} onChange={setAddress} />
      {error && <p className="text-small text-danger-text">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy}>
          Salvar local
        </Button>
        {saved && <span className="text-small text-success">Salvo</span>}
      </div>
    </div>
  );
}
