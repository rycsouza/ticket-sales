"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Field, Select } from "@/components/ui";
import { BR_TIMEZONES, NICHE_OPTIONS } from "@/lib/org-vocab";

export function OrgSettingsForm({
  orgId,
  initialTimezone,
  initialNiche,
}: {
  orgId: string;
  initialTimezone: string;
  initialNiche: string;
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initialTimezone);
  const [niche, setNiche] = useState(initialNiche);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, niche }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Não foi possível salvar as configurações.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Fuso fora da lista curada (ex.: org antiga/importada) continua selecionável.
  const knownTz = BR_TIMEZONES.some((tz) => tz.value === timezone);

  return (
    <Card>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            label="Segmento do negócio"
            htmlFor="settings-niche"
            hint="Adapta os rótulos do painel e da página de vendas (ex.: viagens e vagas em vez de eventos e ingressos)."
          >
            <Select
              id="settings-niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            >
              {NICHE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Fuso horário padrão"
            htmlFor="settings-timezone"
            hint="Novos eventos nascem neste fuso. O comprador sempre vê os horários no fuso do próprio dispositivo, com aviso explícito."
          >
            <Select
              id="settings-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {!knownTz && <option value={timezone}>{timezone}</option>}
              {BR_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-small text-danger">{error}</p>}
          {saved && <p className="text-small text-success-text">Configurações salvas.</p>}
          <Button type="submit" loading={busy}>
            Salvar
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
