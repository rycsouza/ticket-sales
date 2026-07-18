"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Field, Input } from "@/components/ui";

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Não foi possível criar a organização.");
        return;
      }
      router.push(`/painel/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Nova organização" htmlFor="org-name" error={error ?? undefined}>
            <div className="flex gap-2">
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da produtora"
              />
              <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
                Criar
              </Button>
            </div>
          </Field>
        </form>
      </CardBody>
    </Card>
  );
}
