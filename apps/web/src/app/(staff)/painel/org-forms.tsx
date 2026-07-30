"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Field, Input, Select } from "@/components/ui";
import { BR_TIMEZONES, NICHE_OPTIONS } from "@/lib/org-vocab";

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("EVENTOS");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), niche, timezone }),
      });
      const data = (await res.json()) as { id?: string; slug?: string; error?: string };
      if (!res.ok || !data.slug) {
        setError(data.error ?? "Não foi possível criar a organização.");
        return;
      }
      router.push(`/painel/${data.slug}`);
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
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da produtora"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Segmento" htmlFor="org-niche">
              <Select id="org-niche" value={niche} onChange={(e) => setNiche(e.target.value)}>
                {NICHE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fuso horário" htmlFor="org-timezone">
              <Select
                id="org-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {BR_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
            Criar
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
