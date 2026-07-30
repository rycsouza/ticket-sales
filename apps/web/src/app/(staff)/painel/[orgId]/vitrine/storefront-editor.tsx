"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type { TrustItem } from "@ingressos/core";
import { Button, Card, CardBody, Field, Input, Select, Textarea } from "@/components/ui";

const ICON_OPTIONS: { value: TrustItem["icon"]; label: string }[] = [
  { value: "shield", label: "Escudo (segurança)" },
  { value: "users", label: "Pessoas (equipe)" },
  { value: "sparkles", label: "Brilhos (qualidade)" },
  { value: "bus", label: "Ônibus" },
  { value: "map", label: "Mapa" },
  { value: "star", label: "Estrela" },
  { value: "heart", label: "Coração" },
  { value: "ticket", label: "Ingresso" },
];

type FormState = {
  enabled: boolean;
  tagline: string;
  headline: string;
  headlineHighlight: string;
  subheadline: string;
  heroImageUrl: string;
  logoUrl: string;
  whatsapp: string;
  instagram: string;
  seoTitle: string;
  seoDescription: string;
  footerNote: string;
  trustItems: TrustItem[];
};

const EMPTY: FormState = {
  enabled: false,
  tagline: "",
  headline: "",
  headlineHighlight: "",
  subheadline: "",
  heroImageUrl: "",
  logoUrl: "",
  whatsapp: "",
  instagram: "",
  seoTitle: "",
  seoDescription: "",
  footerNote: "",
  trustItems: [],
};

export function StorefrontEditor({
  orgId,
  orgSlug,
  niche,
  initial,
}: {
  orgId: string;
  orgSlug: string;
  niche: string;
  initial: FormState | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function setTrustItem(index: number, patch: Partial<TrustItem>) {
    setForm((f) => ({
      ...f,
      trustItems: f.trustItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
    setSaved(false);
  }

  async function submit() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const text = (v: string) => (v.trim() === "" ? null : v.trim());
      const res = await fetch(`/api/orgs/${orgId}/landing-page`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          tagline: text(form.tagline),
          headline: text(form.headline),
          headlineHighlight: text(form.headlineHighlight),
          subheadline: text(form.subheadline),
          heroImageUrl: text(form.heroImageUrl),
          logoUrl: text(form.logoUrl),
          whatsapp: text(form.whatsapp.replace(/\D/g, "")),
          instagram: text(form.instagram.replace(/^@/, "")),
          seoTitle: text(form.seoTitle),
          seoDescription: text(form.seoDescription),
          footerNote: text(form.footerNote),
          trustItems: form.trustItems.filter((t) => t.title.trim() && t.description.trim()),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Não foi possível salvar a página.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isTravel = niche === "VIAGENS";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Página publicada</p>
              <p className="text-small text-ink-muted">
                Quando ativa, sua vitrine fica no ar em{" "}
                <span className="font-mono text-ink-soft">/{orgSlug}</span>
                {form.enabled && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      href={`/${orgSlug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                    >
                      abrir página <ExternalLink className="size-3" />
                    </Link>
                  </>
                )}
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="size-5 accent-[var(--color-brand)]"
              aria-label="Página publicada"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <p className="text-small font-semibold uppercase tracking-wide text-ink-muted">Capa</p>
          <Field
            label="Chamada pequena"
            htmlFor="sf-tagline"
            hint={isTravel ? 'Ex.: "Saindo de Três Lagoas/MS"' : 'Ex.: "Os melhores eventos da região"'}
          >
            <Input
              id="sf-tagline"
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={80}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Field
              label="Título principal"
              htmlFor="sf-headline"
              hint={isTravel ? 'Ex.: "Sua próxima viagem começa aqui"' : 'Ex.: "Seu próximo rolê começa aqui"'}
            >
              <Input
                id="sf-headline"
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                maxLength={120}
              />
            </Field>
            <Field
              label="Palavra em destaque"
              htmlFor="sf-highlight"
              hint="Aparece em itálico dourado"
            >
              <Input
                id="sf-highlight"
                value={form.headlineHighlight}
                onChange={(e) => set("headlineHighlight", e.target.value)}
                maxLength={40}
              />
            </Field>
          </div>
          <Field label="Subtítulo" htmlFor="sf-subheadline">
            <Textarea
              id="sf-subheadline"
              value={form.subheadline}
              onChange={(e) => set("subheadline", e.target.value)}
              maxLength={240}
              rows={2}
            />
          </Field>
          <Field
            label="Imagem de fundo (URL)"
            htmlFor="sf-hero"
            hint="Use uma imagem já enviada nas páginas dos seus eventos (URL res.cloudinary.com)."
          >
            <Input
              id="sf-hero"
              value={form.heroImageUrl}
              onChange={(e) => set("heroImageUrl", e.target.value)}
              placeholder="https://res.cloudinary.com/…"
            />
          </Field>
          <Field label="Logo (URL)" htmlFor="sf-logo" hint="Também precisa ser res.cloudinary.com.">
            <Input
              id="sf-logo"
              value={form.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://res.cloudinary.com/…"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <p className="text-small font-semibold uppercase tracking-wide text-ink-muted">
            Contato e redes
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="WhatsApp" htmlFor="sf-whatsapp" hint="Só números, com DDI: 5567992949342">
              <Input
                id="sf-whatsapp"
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Instagram" htmlFor="sf-instagram" hint="Handle sem @">
              <Input
                id="sf-instagram"
                value={form.instagram}
                onChange={(e) => set("instagram", e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-small font-semibold uppercase tracking-wide text-ink-muted">
              Selos de confiança
            </p>
            {form.trustItems.length < 4 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="size-4" />}
                onClick={() =>
                  set("trustItems", [
                    ...form.trustItems,
                    { icon: "shield", title: "", description: "" },
                  ])
                }
              >
                Adicionar
              </Button>
            )}
          </div>
          {form.trustItems.length === 0 && (
            <p className="text-small text-ink-muted">
              Até 4 cartões curtos logo abaixo da capa (segurança, equipe, credenciais…).
            </p>
          )}
          {form.trustItems.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[10rem_1fr_auto]"
            >
              <Select
                value={item.icon}
                onChange={(e) => setTrustItem(index, { icon: e.target.value as TrustItem["icon"] })}
                aria-label="Ícone"
              >
                {ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <div className="space-y-2">
                <Input
                  value={item.title}
                  onChange={(e) => setTrustItem(index, { title: e.target.value })}
                  placeholder="Título (ex.: Segurança em 1º lugar)"
                  maxLength={60}
                />
                <Input
                  value={item.description}
                  onChange={(e) => setTrustItem(index, { description: e.target.value })}
                  placeholder="Descrição curta"
                  maxLength={160}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remover selo"
                onClick={() =>
                  set(
                    "trustItems",
                    form.trustItems.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <p className="text-small font-semibold uppercase tracking-wide text-ink-muted">
            SEO e rodapé
          </p>
          <Field
            label="Título para buscadores/compartilhamento"
            htmlFor="sf-seo-title"
            hint='Ex.: "Jovitur — Viagens e Excursões"'
          >
            <Input
              id="sf-seo-title"
              value={form.seoTitle}
              onChange={(e) => set("seoTitle", e.target.value)}
              maxLength={90}
            />
          </Field>
          <Field label="Descrição para buscadores" htmlFor="sf-seo-desc">
            <Textarea
              id="sf-seo-desc"
              value={form.seoDescription}
              onChange={(e) => set("seoDescription", e.target.value)}
              maxLength={200}
              rows={2}
            />
          </Field>
          <Field label="Nota do rodapé" htmlFor="sf-footer" hint="Ex.: crédito das fotos">
            <Input
              id="sf-footer"
              value={form.footerNote}
              onChange={(e) => set("footerNote", e.target.value)}
              maxLength={200}
            />
          </Field>
        </CardBody>
      </Card>

      {error && <p className="text-small text-danger">{error}</p>}
      {saved && <p className="text-small text-success-text">Página salva.</p>}
      <Button type="submit" loading={busy}>
        Salvar página
      </Button>
    </form>
  );
}
