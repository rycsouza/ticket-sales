"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import type { PageBlock, PageBlockType } from "@ingressos/core";
import { brandTokens } from "@/lib/brand-theme";
import {
  Alert,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuLabel,
  Select,
  Textarea,
} from "@/components/ui";
import type { OrgVocab } from "@/lib/org-vocab";
import { ConfirmDialog } from "../../../../ui";

interface EditorPage {
  brandColor: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  faviconUrl: string | null;
  backgroundUrl: string | null;
  theme: "light" | "dark";
  blocks: PageBlock[];
}

/**
 * Backward-compat: cover images now live on the hero block (config.images) and
 * render as a carousel. Events saved before this had a single page-level
 * bannerUrl — seed it as the hero's first cover so it stays visible/manageable.
 */
function seedHeroCovers(blocks: PageBlock[], bannerUrl: string | null): PageBlock[] {
  if (!bannerUrl) return blocks;
  return blocks.map((b) =>
    b.type === "hero" && b.config.images.length === 0
      ? { ...b, config: { ...b.config, images: [bannerUrl] } }
      : b,
  );
}

/** First hero cover — mirrored back into bannerUrl for the social/OG card. */
function heroCover0(blocks: PageBlock[]): string | null {
  const hero = blocks.find((b) => b.type === "hero");
  return hero && hero.config.images.length > 0 ? hero.config.images[0]! : null;
}

const blockLabel = (v: OrgVocab): Record<PageBlockType, string> => ({
  hero: "Capa",
  description: "Descrição",
  location: v.venue,
  tickets: `${v.Tickets} (checkout)`,
  organizer: "Realização",
  faq: "Perguntas frequentes",
  lineup: "Atrações",
  gallery: "Galeria de fotos",
  video: "Vídeo (YouTube)",
  countdown: "Contagem regressiva",
});

/** Blocos opcionais agrupados para o menu "Adicionar seção" (tickets é fixo). */
const addGroups = (v: OrgVocab): { label: string; types: PageBlockType[] }[] => [
  { label: "Destaque", types: ["hero", "countdown"] },
  { label: "Conteúdo", types: ["description", "lineup", "faq"] },
  // Galeria de fotos foi descontinuada — a capa em carrossel cobre esse caso.
  // (Blocos de galeria já salvos seguem editáveis/removíveis pela lista.)
  { label: "Mídia", types: ["video"] },
  { label: `Informações ${v.ofEvent}`, types: ["location", "organizer"] },
];

const DEFAULT_BRAND = "#2563eb";

/** WCAG relative luminance of a #rrggbb color. */
function hexLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 1;
  const int = Number.parseInt(match[1]!, 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Contrast ratio of white text over the given background color. */
function contrastWithWhite(hex: string): number {
  return 1.05 / (hexLuminance(hex) + 0.05);
}

function newBlock(type: PageBlockType, existing: PageBlock[]): PageBlock {
  let id = type as string;
  let n = 2;
  while (existing.some((b) => b.id === id)) id = `${type}-${n++}`;
  switch (type) {
    case "hero":
      return {
        id,
        type,
        visible: true,
        config: { showLogo: true, showTitle: true, showDate: true, overlay: "dark", images: [] },
      };
    case "description":
      return { id, type, visible: true, config: { text: null } };
    case "location":
      return { id, type, visible: true, config: { showMap: false } };
    case "organizer":
      return { id, type, visible: true, config: { showLogo: true } };
    case "faq":
      return { id, type, visible: true, config: { items: [{ question: "", answer: "" }] } };
    case "lineup":
      return { id, type, visible: true, config: { items: [{ name: "" }] } };
    case "gallery":
      return { id, type, visible: true, config: { images: [] } };
    case "video":
      return { id, type, visible: true, config: { youtubeId: "" } };
    case "countdown":
      return { id, type, visible: true, config: {} };
    case "tickets":
      return { id, type, visible: true, config: {} };
  }
}

export function PageEditor({
  orgId,
  eventId,
  previewHref,
  vocab,
  initial,
}: {
  orgId: string;
  eventId: string;
  previewHref: string;
  vocab: OrgVocab;
  initial: EditorPage;
}) {
  const BLOCK_LABEL = blockLabel(vocab);
  const ADD_GROUPS = addGroups(vocab);
  const router = useRouter();
  const [brandColor, setBrandColor] = useState(initial.brandColor ?? "");
  const [theme, setTheme] = useState<"light" | "dark">(initial.theme);
  const [images, setImages] = useState({
    logoUrl: initial.logoUrl,
    bannerUrl: initial.bannerUrl,
    faviconUrl: initial.faviconUrl,
    backgroundUrl: initial.backgroundUrl,
  });
  const [blocks, setBlocks] = useState<PageBlock[]>(() =>
    seedHeroCovers(initial.blocks, initial.bannerUrl),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const colorValid = brandColor === "" || /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const preview = brandTokens(colorValid && brandColor ? brandColor : null);
  const lowContrast = colorValid && brandColor !== "" && contrastWithWhite(brandColor) < 4.5;

  // Dirty tracking: compare the whole editable state against the last-saved
  // baseline so the UI can report "Alterações não salvas" vs "salvas".
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      brandColor: initial.brandColor ?? "",
      theme: initial.theme,
      images: {
        logoUrl: initial.logoUrl,
        bannerUrl: initial.bannerUrl,
        faviconUrl: initial.faviconUrl,
        backgroundUrl: initial.backgroundUrl,
      },
      blocks: seedHeroCovers(initial.blocks, initial.bannerUrl),
    }),
  );
  const current = useMemo(
    () => JSON.stringify({ brandColor, theme, images, blocks }),
    [brandColor, theme, images, blocks],
  );
  const dirty = current !== baseline;

  function move(index: number, delta: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    setSaved(false);
  }

  function patchBlock(id: string, patch: (block: PageBlock) => PageBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? patch(b) : b)));
    setSaved(false);
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSaved(false);
  }

  function addBlock(type: PageBlockType) {
    setBlocks((prev) => [...prev, newBlock(type, prev)]);
    setSaved(false);
  }

  /** Remove itens em branco e aponta blocos sem conteúdo antes do PUT. */
  function cleanBlocks(): { blocks?: PageBlock[]; problem?: string } {
    const cleaned: PageBlock[] = [];
    for (const block of blocks) {
      if (block.type === "faq") {
        const items = block.config.items.filter((i) => i.question.trim() && i.answer.trim());
        if (items.length === 0)
          return { problem: "Preencha ao menos uma pergunta no FAQ ou remova o bloco." };
        cleaned.push({ ...block, config: { ...block.config, items } });
      } else if (block.type === "lineup") {
        const items = block.config.items.filter((i) => i.name.trim());
        if (items.length === 0)
          return { problem: "Adicione ao menos uma atração ou remova o bloco." };
        cleaned.push({ ...block, config: { ...block.config, items } });
      } else if (block.type === "gallery") {
        if (block.config.images.length === 0)
          return { problem: "Envie ao menos uma foto na galeria ou remova o bloco." };
        cleaned.push(block);
      } else if (block.type === "video") {
        if (!/^[A-Za-z0-9_-]{11}$/.test(block.config.youtubeId))
          return { problem: "Informe o link ou ID do vídeo do YouTube, ou remova o bloco." };
        cleaned.push(block);
      } else {
        cleaned.push(block);
      }
    }
    return { blocks: cleaned };
  }

  async function save() {
    setError(null);
    setBusy(true);
    setSaved(false);
    try {
      const { blocks: cleaned, problem } = cleanBlocks();
      if (problem) {
        setError(problem);
        return;
      }
      // Keep the social/OG card in sync with the first cover image.
      const nextImages = { ...images, bannerUrl: heroCover0(cleaned!) };
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/page`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandColor: brandColor === "" ? null : brandColor.toLowerCase(),
          theme,
          logoUrl: nextImages.logoUrl,
          bannerUrl: nextImages.bannerUrl,
          faviconUrl: nextImages.faviconUrl,
          backgroundUrl: nextImages.backgroundUrl,
          blocks: cleaned,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar a página.");
        return;
      }
      setImages(nextImages);
      setBlocks(cleaned!);
      setBaseline(JSON.stringify({ brandColor, theme, images: nextImages, blocks: cleaned }));
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Identidade visual */}
      <Card>
        <CardHeader title="Identidade visual" />
        <CardBody className="space-y-4">
          <Field label="Cor da marca" htmlFor="brand-color">
            <div className="flex items-center gap-3">
              <input
                id="brand-color"
                type="color"
                value={colorValid && brandColor ? brandColor : "#2563eb"}
                onChange={(e) => {
                  setBrandColor(e.target.value);
                  setSaved(false);
                }}
                className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
              />
              <Input
                value={brandColor}
                onChange={(e) => {
                  setBrandColor(e.target.value.trim());
                  setSaved(false);
                }}
                placeholder="Padrão (#2563eb)"
                className="max-w-40"
              />
              {brandColor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBrandColor("");
                    setSaved(false);
                  }}
                >
                  Restaurar cor padrão
                </Button>
              )}
            </div>
          </Field>
          {!colorValid && (
            <p className="text-small text-danger">Use o formato #rrggbb (ex.: #16a34a).</p>
          )}
          {lowContrast && (
            <Alert tone="warning" icon={<AlertTriangle className="size-5" />}>
              Essa cor pode deixar o texto branco dos botões difícil de ler. Considere um tom mais
              escuro para manter a página acessível.
            </Alert>
          )}

          <Field label="Tema da página" htmlFor="page-theme">
            <div id="page-theme" className="inline-flex rounded-lg border border-line-strong p-0.5">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTheme(t);
                    setSaved(false);
                  }}
                  aria-pressed={theme === t}
                  className={
                    theme === t
                      ? "rounded-md bg-brand px-4 py-1.5 text-small font-medium text-brand-fg"
                      : "rounded-md px-4 py-1.5 text-small font-medium text-ink-soft hover:bg-hover"
                  }
                >
                  {t === "light" ? "Claro" : "Escuro"}
                </button>
              ))}
            </div>
          </Field>

          {/* Amostra do tema aplicado */}
          <div
            data-theme={theme}
            className="rounded-xl border border-line bg-surface p-4"
            style={preview as React.CSSProperties}
          >
            <p className="mb-2 text-caption font-semibold uppercase tracking-widest text-brand">
              Evento
            </p>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-small font-medium text-brand-fg">
                Botão de compra
              </span>
              <span className="inline-flex items-center rounded-lg border border-brand-border bg-brand-soft px-3 py-1.5 text-small text-brand">
                Destaque
              </span>
            </div>
            <p className="mt-2 text-small text-ink-muted">
              Assim os botões e destaques aparecem na página de venda.
            </p>
          </div>

          <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-small text-ink-muted">
            As imagens de capa (uma ou várias, em carrossel) ficam no bloco{" "}
            <strong className="text-ink-soft">Capa</strong>, mais abaixo.
          </p>
          <ImageUploader
            label="Logo"
            hint="Fundo transparente (PNG) · recomendado 400×400 px · até 1 MB."
            kind="logo"
            orgId={orgId}
            eventId={eventId}
            url={images.logoUrl}
            onChange={(url) => {
              setImages((prev) => ({ ...prev, logoUrl: url }));
              setSaved(false);
            }}
            previewClass="h-16 w-auto rounded-lg object-contain"
          />
          <ImageUploader
            label="Favicon (ícone da aba)"
            hint="Quadrado · recomendado 64×64 px · PNG ou WebP · até 1 MB."
            kind="favicon"
            orgId={orgId}
            eventId={eventId}
            url={images.faviconUrl}
            onChange={(url) => {
              setImages((prev) => ({ ...prev, faviconUrl: url }));
              setSaved(false);
            }}
            previewClass="size-8 rounded object-contain"
          />
          <ImageUploader
            label="Imagem de fundo (atrás do checkout)"
            hint="Imagem ampla · recomendado 1920×1080 px · JPEG, PNG ou WebP · até 5 MB."
            kind="background"
            orgId={orgId}
            eventId={eventId}
            url={images.backgroundUrl}
            onChange={(url) => {
              setImages((prev) => ({ ...prev, backgroundUrl: url }));
              setSaved(false);
            }}
            previewClass="h-16 w-auto rounded-lg object-cover"
          />
          <p className="text-small text-ink-muted">
            As imagens vão ao ar quando você salvar a página.
          </p>
        </CardBody>
      </Card>

      {/* Blocos */}
      <Card>
        <CardHeader title="Blocos da página" />
        <ul className="divide-y divide-line">
          {blocks.map((block, index) => {
            const isTickets = block.type === "tickets";
            const isExpanded = expanded === block.id;
            return (
              <li key={block.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : block.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-ink-muted" />
                    )}
                    <span
                      className={`truncate text-body font-medium ${
                        block.visible || isTickets ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      {BLOCK_LABEL[block.type]}
                    </span>
                    {isTickets ? (
                      <Badge tone="brand">Obrigatório</Badge>
                    ) : !block.visible ? (
                      <Badge tone="neutral">Oculto</Badge>
                    ) : null}
                  </button>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Mover para cima"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded p-1.5 text-ink-muted transition-colors hover:bg-hover disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mover para baixo"
                      disabled={index === blocks.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded p-1.5 text-ink-muted transition-colors hover:bg-hover disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    {!isTickets && (
                      <>
                        <button
                          type="button"
                          aria-label={block.visible ? "Ocultar bloco" : "Mostrar bloco"}
                          onClick={() =>
                            patchBlock(block.id, (b) => ({ ...b, visible: !b.visible }) as PageBlock)
                          }
                          className="rounded p-1.5 text-ink-muted transition-colors hover:bg-hover"
                        >
                          {block.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        </button>
                        <button
                          type="button"
                          aria-label="Excluir bloco"
                          title="Excluir bloco"
                          onClick={() =>
                            setPendingDelete({ id: block.id, label: BLOCK_LABEL[block.type] })
                          }
                          className="rounded p-1.5 text-danger transition-colors hover:bg-hover"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3 border-l-2 border-line pl-4">
                    <BlockConfigForm
                      vocab={vocab}
                      block={block}
                      patchBlock={patchBlock}
                      orgId={orgId}
                      eventId={eventId}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <CardBody className="border-t border-line">
          {(() => {
            const groups = ADD_GROUPS.map((g) => ({
              ...g,
              types: g.types.filter((t) => !blocks.some((b) => b.type === t)),
            })).filter((g) => g.types.length > 0);
            if (groups.length === 0) {
              return <p className="text-small text-ink-muted">Todas as seções já foram adicionadas.</p>;
            }
            return (
              <Menu
                triggerContent={
                  <>
                    <Plus className="size-4" />
                    Adicionar seção
                    <ChevronDown className="size-4" />
                  </>
                }
                triggerVariant="outline"
                triggerSize="md"
                align="start"
              >
                {groups.map((g) => (
                  <div key={g.label}>
                    <MenuLabel>{g.label}</MenuLabel>
                    {g.types.map((t) => (
                      <MenuItem key={t} onSelect={() => addBlock(t)}>
                        {BLOCK_LABEL[t]}
                      </MenuItem>
                    ))}
                  </div>
                ))}
              </Menu>
            );
          })()}
        </CardBody>
      </Card>

      {/* Salvar — static on mobile (a sticky bottom-0 bar would sit BEHIND the
          fixed mobile bottom nav); sticky only from lg up where there is none. */}
      <div className="-mx-1 flex flex-wrap items-center gap-3 rounded-t-xl border-t border-line bg-surface/95 px-1 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:col-span-2">
        <Button loading={busy} disabled={!colorValid || !dirty} onClick={() => void save()}>
          {dirty ? "Salvar alterações" : "Tudo salvo"}
        </Button>
        <button
          type="button"
          onClick={() => {
            // Hand the current (possibly unsaved) draft to the preview tab so it
            // shows exactly what's on screen — not the last-saved version.
            try {
              const draft = {
                brandColor: brandColor === "" ? null : brandColor.toLowerCase(),
                theme,
                logoUrl: images.logoUrl,
                bannerUrl: heroCover0(blocks),
                faviconUrl: images.faviconUrl,
                backgroundUrl: images.backgroundUrl,
                blocks,
              };
              sessionStorage.setItem(`ingressos:page-preview:${eventId}`, JSON.stringify(draft));
            } catch {
              // sessionStorage unavailable → preview falls back to the saved page.
            }
            window.open(previewHref, "_blank", "noopener,noreferrer");
          }}
          className={buttonVariants({ variant: "outline" })}
        >
          <Eye className="size-4" />
          Pré-visualizar
        </button>
        <span className="text-small" role="status" aria-live="polite">
          {busy ? (
            <span className="text-ink-muted">Salvando…</span>
          ) : error ? (
            <span className="text-danger">Erro ao salvar: {error}</span>
          ) : dirty ? (
            <span className="text-warning-text">Alterações não salvas</span>
          ) : saved ? (
            <span className="font-medium text-success-text">Alterações salvas</span>
          ) : null}
        </span>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Excluir seção?"
        description={
          <>
            A seção <strong className="text-ink">{pendingDelete?.label}</strong> e o seu conteúdo
            serão removidos ao salvar a página.
          </>
        }
        confirmLabel="Excluir seção"
        tone="danger"
        onConfirm={async () => {
          if (pendingDelete) removeBlock(pendingDelete.id);
          return { ok: true };
        }}
      />
    </div>
  );
}

/** Extrai o ID de 11 chars de qualquer formato de link do YouTube (ou ID puro). */
function extractYoutubeId(input: string): string {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return match?.[1] ?? trimmed;
}

function BlockConfigForm({
  block,
  patchBlock,
  orgId,
  eventId,
  vocab,
}: {
  block: PageBlock;
  patchBlock: (id: string, patch: (block: PageBlock) => PageBlock) => void;
  orgId: string;
  eventId: string;
  vocab: OrgVocab;
}) {
  function setConfig(patch: Record<string, unknown>) {
    patchBlock(block.id, (b) => ({ ...b, config: { ...b.config, ...patch } }) as PageBlock);
  }

  switch (block.type) {
    case "hero":
      return (
        <>
          <div>
            <p className="text-small font-medium text-ink-soft">Imagens de capa</p>
            <p className="mb-2 text-caption text-ink-muted">
              Uma imagem = capa fixa. Duas ou mais viram um carrossel no checkout. A primeira é
              também a imagem de compartilhamento (WhatsApp/redes).
            </p>
            {block.config.images.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {block.config.images.map((url, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="aspect-video w-full rounded-lg border border-line object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
                        Capa
                      </span>
                    )}
                    <div className="absolute right-1 top-1 flex gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          aria-label="Mover para a esquerda"
                          onClick={() => {
                            const next = [...block.config.images];
                            [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                            setConfig({ images: next });
                          }}
                          className="rounded-md bg-surface/90 p-1 text-ink-soft shadow-sm transition-colors hover:bg-surface"
                        >
                          <ChevronLeft className="size-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Remover imagem"
                        onClick={() =>
                          setConfig({ images: block.config.images.filter((_, j) => j !== i) })
                        }
                        className="rounded-md bg-surface/90 p-1 text-danger shadow-sm transition-colors hover:bg-surface"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {block.config.images.length < 8 && (
              <GalleryUpload
                orgId={orgId}
                eventId={eventId}
                kind="banner"
                label="Adicionar capa"
                onUploaded={(url) => setConfig({ images: [...block.config.images, url] })}
              />
            )}
          </div>
          <Toggle
            label="Mostrar logo"
            checked={block.config.showLogo}
            onChange={(v) => setConfig({ showLogo: v })}
          />
          <Toggle
            label="Mostrar título"
            checked={block.config.showTitle}
            onChange={(v) => setConfig({ showTitle: v })}
          />
          <Toggle
            label="Mostrar data"
            checked={block.config.showDate}
            onChange={(v) => setConfig({ showDate: v })}
          />
          <Field label="Sobreposição do banner" htmlFor={`${block.id}-overlay`}>
            <Select
              id={`${block.id}-overlay`}
              value={block.config.overlay}
              onChange={(e) => setConfig({ overlay: e.target.value })}
            >
              <option value="dark">Escura</option>
              <option value="brand">Cor da marca</option>
              <option value="none">Nenhuma</option>
            </Select>
          </Field>
        </>
      );
    case "description":
      return (
        <>
          <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
            <Input
              id={`${block.id}-heading`}
              value={block.config.heading ?? ""}
              maxLength={80}
              onChange={(e) => setConfig({ heading: e.target.value || undefined })}
              placeholder={`Ex.: Sobre ${vocab.theEvent}`}
            />
          </Field>
          <Field label={`Texto (vazio = descrição ${vocab.ofEvent})`} htmlFor={`${block.id}-text`}>
            <Textarea
              id={`${block.id}-text`}
              rows={4}
              maxLength={5000}
              value={block.config.text ?? ""}
              onChange={(e) => setConfig({ text: e.target.value || null })}
              placeholder="Deixe vazio para usar a descrição cadastrada no evento."
            />
          </Field>
        </>
      );
    case "location":
      return (
        <>
          <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-small text-ink-muted">
            O {vocab.venue.toLowerCase()} é puxado dos <strong className="text-ink-soft">detalhes {vocab.ofEvent}</strong>. Aqui
            você só decide se ele aparece (e onde) no checkout.
          </p>
          <Toggle
            label="Mostrar mapa e botão “como chegar”"
            checked={block.config.showMap}
            onChange={(v) => setConfig({ showMap: v })}
          />
        </>
      );
    case "tickets":
      return (
        <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
          <Input
            id={`${block.id}-heading`}
            value={block.config.heading ?? ""}
            maxLength={80}
            onChange={(e) => setConfig({ heading: e.target.value || undefined })}
            placeholder="Ex.: Garanta o seu"
          />
        </Field>
      );
    case "organizer":
      return (
        <>
          <Toggle
            label="Mostrar logo da produtora"
            checked={block.config.showLogo}
            onChange={(v) => setConfig({ showLogo: v })}
          />
          <Field label="Contato (opcional)" htmlFor={`${block.id}-contact`}>
            <Input
              id={`${block.id}-contact`}
              value={block.config.contactText ?? ""}
              maxLength={300}
              onChange={(e) => setConfig({ contactText: e.target.value || undefined })}
              placeholder="Ex.: contato@produtora.com.br"
            />
          </Field>
          <Field label="Instagram (opcional)" htmlFor={`${block.id}-ig`}>
            <Input
              id={`${block.id}-ig`}
              value={block.config.instagram ?? ""}
              maxLength={30}
              onChange={(e) =>
                setConfig({ instagram: e.target.value.replace(/^@/, "").trim() || undefined })
              }
              placeholder="usuario (sem @)"
            />
          </Field>
          <Field label="WhatsApp (opcional)" htmlFor={`${block.id}-wa`}>
            <Input
              id={`${block.id}-wa`}
              value={block.config.whatsapp ?? ""}
              maxLength={15}
              onChange={(e) =>
                setConfig({ whatsapp: e.target.value.replace(/\D/g, "") || undefined })
              }
              placeholder="Só dígitos com DDD: 11999998888"
            />
          </Field>
          <Field label="Site (opcional)" htmlFor={`${block.id}-site`}>
            <Input
              id={`${block.id}-site`}
              value={block.config.website ?? ""}
              maxLength={200}
              onChange={(e) => setConfig({ website: e.target.value.trim() || undefined })}
              placeholder="https://produtora.com.br"
            />
          </Field>
        </>
      );
    case "faq":
      return (
        <>
          <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
            <Input
              id={`${block.id}-heading`}
              value={block.config.heading ?? ""}
              maxLength={80}
              onChange={(e) => setConfig({ heading: e.target.value || undefined })}
              placeholder="Perguntas frequentes"
            />
          </Field>
          {block.config.items.map((item, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-small font-medium text-ink-muted">Pergunta {i + 1}</p>
                {block.config.items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setConfig({ items: block.config.items.filter((_, j) => j !== i) })
                    }
                  >
                    Remover
                  </Button>
                )}
              </div>
              <Input
                value={item.question}
                maxLength={200}
                onChange={(e) =>
                  setConfig({
                    items: block.config.items.map((it, j) =>
                      j === i ? { ...it, question: e.target.value } : it,
                    ),
                  })
                }
                placeholder="Ex.: Tem meia-entrada?"
              />
              <Textarea
                rows={2}
                maxLength={2000}
                value={item.answer}
                onChange={(e) =>
                  setConfig({
                    items: block.config.items.map((it, j) =>
                      j === i ? { ...it, answer: e.target.value } : it,
                    ),
                  })
                }
                placeholder="Resposta"
              />
            </div>
          ))}
          {block.config.items.length < 20 && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              onClick={() =>
                setConfig({ items: [...block.config.items, { question: "", answer: "" }] })
              }
            >
              Pergunta
            </Button>
          )}
        </>
      );
    case "lineup":
      return (
        <>
          <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
            <Input
              id={`${block.id}-heading`}
              value={block.config.heading ?? ""}
              maxLength={80}
              onChange={(e) => setConfig({ heading: e.target.value || undefined })}
              placeholder="Atrações"
            />
          </Field>
          {block.config.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item.name}
                maxLength={120}
                onChange={(e) =>
                  setConfig({
                    items: block.config.items.map((it, j) =>
                      j === i ? { ...it, name: e.target.value } : it,
                    ),
                  })
                }
                placeholder="Nome da atração"
              />
              <Input
                value={item.time ?? ""}
                maxLength={40}
                onChange={(e) =>
                  setConfig({
                    items: block.config.items.map((it, j) =>
                      j === i ? { ...it, time: e.target.value || undefined } : it,
                    ),
                  })
                }
                placeholder="22h"
                className="max-w-24"
              />
              {block.config.items.length > 1 && (
                <button
                  type="button"
                  aria-label="Remover atração"
                  onClick={() =>
                    setConfig({ items: block.config.items.filter((_, j) => j !== i) })
                  }
                  className="rounded p-1.5 text-danger transition-colors hover:bg-hover"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {block.config.items.length < 50 && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              onClick={() => setConfig({ items: [...block.config.items, { name: "" }] })}
            >
              Atração
            </Button>
          )}
        </>
      );
    case "gallery":
      return (
        <>
          <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
            <Input
              id={`${block.id}-heading`}
              value={block.config.heading ?? ""}
              maxLength={80}
              onChange={(e) => setConfig({ heading: e.target.value || undefined })}
              placeholder="Ex.: Edições anteriores"
            />
          </Field>
          {block.config.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {block.config.images.map((url, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-lg border border-line object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Remover foto"
                    onClick={() =>
                      setConfig({ images: block.config.images.filter((_, j) => j !== i) })
                    }
                    className="absolute right-1 top-1 rounded-md bg-surface/90 p-1 text-danger shadow-sm transition-colors hover:bg-surface"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {block.config.images.length < 12 && (
            <GalleryUpload
              orgId={orgId}
              eventId={eventId}
              onUploaded={(url) => setConfig({ images: [...block.config.images, url] })}
            />
          )}
        </>
      );
    case "video":
      return (
        <Field label="Link ou ID do vídeo (YouTube)" htmlFor={`${block.id}-yt`}>
          <Input
            id={`${block.id}-yt`}
            value={block.config.youtubeId}
            onChange={(e) => setConfig({ youtubeId: extractYoutubeId(e.target.value) })}
            placeholder="https://youtube.com/watch?v=…"
          />
        </Field>
      );
    case "countdown":
      return (
        <>
          <Field label="Título da seção (opcional)" htmlFor={`${block.id}-heading`}>
            <Input
              id={`${block.id}-heading`}
              value={block.config.heading ?? ""}
              maxLength={80}
              onChange={(e) => setConfig({ heading: e.target.value || undefined })}
              placeholder="Ex.: Falta pouco!"
            />
          </Field>
          <p className="text-small text-ink-muted">
            Conta até a data de início do evento e some automaticamente depois que começa.
          </p>
        </>
      );
  }
}

function GalleryUpload({
  orgId,
  eventId,
  onUploaded,
  kind = "gallery",
  label = "Adicionar foto",
}: {
  orgId: string;
  eventId: string;
  onUploaded: (url: string) => void;
  kind?: "gallery" | "banner";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/page/images`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Falha no envio da imagem.");
        return;
      }
      onUploaded(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-small font-medium text-ink-soft transition-colors hover:bg-hover">
        <Plus className="size-4" />
        {busy ? "Enviando…" : "Adicionar foto"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="mt-1 text-small text-danger">{error}</p>}
    </div>
  );
}

function ImageUploader({
  label,
  hint,
  kind,
  orgId,
  eventId,
  url,
  onChange,
  previewClass,
}: {
  label: string;
  hint?: string;
  kind: "logo" | "banner" | "favicon" | "background";
  orgId: string;
  eventId: string;
  url: string | null;
  onChange: (url: string | null) => void;
  previewClass: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch(`/api/orgs/${orgId}/events/${eventId}/page/images`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Falha no envio da imagem.");
        return;
      }
      onChange(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-small font-medium text-ink-soft">{label}</p>
      {hint && <p className="mb-1.5 text-caption text-ink-muted">{hint}</p>}
      {!hint && <div className="mb-1.5" />}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={`mb-2 border border-line bg-subtle ${previewClass}`} />
      )}
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-small font-medium text-ink-soft transition-colors hover:bg-hover">
          {busy ? "Enviando…" : url ? "Trocar imagem" : "Enviar imagem"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remover
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-small text-danger">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-brand)]"
      />
      {label}
    </label>
  );
}
