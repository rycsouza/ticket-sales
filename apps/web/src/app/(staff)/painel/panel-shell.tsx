"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  LogOut,
  X,
  Ticket,
  ArrowLeftRight,
  MoreHorizontal,
  Search,
  Globe,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { brandTokens } from "@/lib/brand-theme";
import { orgVocab, type OrgVocab } from "@/lib/org-vocab";
import type { OrgNiche } from "@ingressos/core";
import { ThemeToggle, type PanelTheme } from "./theme-toggle";

type NavOrg = { slug: string; name: string; niche?: OrgNiche };

interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: (pathname: string) => boolean;
  /** external app link (e.g. Portaria) — not part of the bottom tabs */
  external?: boolean;
}

function navItems(orgId: string, vocab: OrgVocab): NavItem[] {
  const base = `/painel/${orgId}`;
  // Navegação enxuta: Afiliados/Promoters, Ofertas e Relatório estão OCULTOS
  // por decisão de produto (código e APIs preservados — reativar = re-adicionar
  // aqui; os KPIs do Relatório moraram no Dashboard).
  return [
    {
      href: base,
      label: "Dashboard",
      icon: LayoutDashboard,
      match: (p) => p === base,
    },
    {
      // Ambos os segmentos: o filesystem é /eventos, mas orgs de VIAGENS
      // navegam por /viagens (rewrite no middleware).
      href: `${base}/${vocab.eventsSegment}`,
      label: vocab.Events,
      icon: CalendarDays,
      match: (p) => p.startsWith(`${base}/eventos`) || p.startsWith(`${base}/viagens`),
    },
    {
      href: `${base}/pedidos`,
      label: "Pedidos",
      icon: Receipt,
      match: (p) => p.startsWith(`${base}/pedidos`),
    },
    {
      href: `${base}/clientes`,
      label: "Clientes",
      icon: Users,
      match: (p) => p.startsWith(`${base}/clientes`),
    },
  ];
}

/** Itens da seção Operação — também alimentam a busca do menu. */
function operationItems(org: NavOrg, vocab: OrgVocab, isPlatformAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/checkin",
      label: vocab.checkinArea,
      icon: ScanLine,
      match: () => false,
    },
  ];
  if (isPlatformAdmin) {
    items.push(
      {
        href: `/painel/${org.slug}/configuracoes`,
        label: "Configurações",
        icon: Settings,
        match: (p) => p.startsWith(`/painel/${org.slug}/configuracoes`),
      },
      {
        href: `/painel/${org.slug}/vitrine`,
        label: "Minha página",
        icon: Globe,
        match: (p) => p.startsWith(`/painel/${org.slug}/vitrine`),
      },
      {
        href: "/plataforma",
        label: "Plataforma",
        icon: ShieldCheck,
        match: () => false,
      },
    );
  }
  return items;
}

/** Busca do menu: casa rótulos sem caixa nem acentos ("configuracoes" acha "Configurações"). */
function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Primary tabs shown in the mobile bottom bar (the rest go under "Mais"). */
const BOTTOM_TAB_COUNT = 3;

async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export function PanelShell({
  org,
  multiOrg,
  isPlatformAdmin = false,
  theme = "dark",
  brandColor = null,
  logoUrl = null,
  children,
}: {
  org: NavOrg;
  multiOrg: boolean;
  isPlatformAdmin?: boolean;
  theme?: PanelTheme;
  /** Cor de marca do tenant — tinge os tokens --color-brand* do painel. */
  brandColor?: string | null;
  /** Logo da vitrine do tenant — assume o topo do painel (fallback: plataforma). */
  logoUrl?: string | null;
  children: ReactNode;
}) {
  // Inválida/ausente → {} (tokens padrão do tema; nunca injeta CSS ruim).
  const brandStyle = brandTokens(brandColor) as CSSProperties;
  const vocab = orgVocab(org.niche);
  const searchEntries = [
    ...navItems(org.slug, vocab),
    ...operationItems(org, vocab, isPlatformAdmin),
  ];
  return (
    <div
      id="panel-shell"
      data-theme={theme}
      style={brandStyle}
      className="min-h-svh bg-page text-ink"
    >
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent
          org={org}
          multiOrg={multiOrg}
          isPlatformAdmin={isPlatformAdmin}
          theme={theme}
          logoUrl={logoUrl}
        />
      </aside>

      {/* Mobile top bar (brand + org context + search) */}
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <BrandMark name={org.name} logoUrl={logoUrl} />
        <MenuSearch entries={searchEntries} />
      </header>

      {/* Content — extra bottom padding on mobile clears the bottom nav */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav
        org={org}
        multiOrg={multiOrg}
        isPlatformAdmin={isPlatformAdmin}
        theme={theme}
      />
    </div>
  );
}

/** Marca no topo: logo da vitrine da org (fallback: logomarca da plataforma) + nome da org. */
function BrandMark({ name, logoUrl }: { name: string; logoUrl?: string | null | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo do CDN (Cloudinary), tamanho fixo
        <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <Ticket className="size-5" strokeWidth={2} />
        </span>
      )}
      <span className="truncate text-h3 font-semibold text-ink" title={name}>
        {name}
      </span>
    </span>
  );
}

function MobileBottomNav({
  org,
  multiOrg,
  isPlatformAdmin,
  theme,
}: {
  org: NavOrg;
  multiOrg: boolean;
  isPlatformAdmin: boolean;
  theme: PanelTheme;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const vocab = orgVocab(org.niche);
  const items = navItems(org.slug, vocab);
  const tabs = items.slice(0, BOTTOM_TAB_COUNT);
  const overflow = items.slice(BOTTOM_TAB_COUNT);
  const moreActive = overflow.some((i) => i.match(pathname));

  async function logout() {
    setMoreOpen(false);
    await logoutRequest();
    router.push("/entrar");
  }

  return (
    <>
      <nav
        aria-label="Navegação"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 text-caption font-medium transition-colors",
                    active ? "text-brand" : "text-ink-muted",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={cn(
                "flex w-full flex-col items-center gap-0.5 py-2.5 text-caption font-medium transition-colors",
                moreActive || moreOpen ? "text-brand" : "text-ink-muted",
              )}
            >
              <MoreHorizontal className="size-5" strokeWidth={moreActive || moreOpen ? 2 : 1.75} />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {/* "Mais" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Mais opções">
          <div
            className="absolute inset-0"
            style={{ background: "var(--overlay)" }}
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-small font-semibold text-ink">Mais</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-hover"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="space-y-1">
              {overflow.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium transition-colors",
                        active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-hover",
                      )}
                    >
                      <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {operationItems(org, vocab, isPlatformAdmin).map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                    >
                      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {multiOrg && (
                <li>
                  <Link
                    href="/painel"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                  >
                    <ArrowLeftRight className="size-5 shrink-0" strokeWidth={1.75} />
                    Trocar organização
                  </Link>
                </li>
              )}
              <li>
                <ThemeToggle initial={theme} />
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                >
                  <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
                  Sair
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Busca EXCLUSIVA da navbar: procura itens do MENU (não conteúdo). No desktop
 * o pai também usa o termo para filtrar a lista visível; Enter navega para o
 * primeiro item que casar.
 */
function MenuSearch({
  entries,
  value,
  onChange,
  onNavigate,
}: {
  entries: { href: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [own, setOwn] = useState("");
  const q = value ?? own;
  const setQ = onChange ?? setOwn;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = normalizeLabel(q.trim());
        if (!term) return;
        const hit = entries.find((i) => normalizeLabel(i.label).includes(term));
        if (!hit) return;
        setQ("");
        router.push(hit.href);
        onNavigate?.();
      }}
      className="relative"
      role="search"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar no menu"
        aria-label="Buscar no menu"
        className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-8 pr-3 text-body text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    </form>
  );
}

function SidebarContent({
  org,
  multiOrg,
  isPlatformAdmin,
  theme,
  logoUrl,
}: {
  org: NavOrg;
  multiOrg: boolean;
  isPlatformAdmin: boolean;
  theme: PanelTheme;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const vocab = orgVocab(org.niche);
  const items = navItems(org.slug, vocab);
  const operation = operationItems(org, vocab, isPlatformAdmin);

  // Busca do menu: o termo filtra as duas seções ao vivo; Enter navega.
  const [query, setQuery] = useState("");
  const q = normalizeLabel(query.trim());
  const show = (label: string) => !q || normalizeLabel(label).includes(q);
  const visibleItems = items.filter((i) => show(i.label));
  const visibleOperation = operation.filter((i) => show(i.label));

  async function logout() {
    await logoutRequest();
    router.push("/entrar");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand + org */}
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <BrandMark name={org.name} logoUrl={logoUrl} />
          {multiOrg && (
            <Link
              href="/painel"
              title="Trocar organização"
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <ArrowLeftRight className="size-3.5" />
              Trocar
            </Link>
          )}
        </div>
        <div className="mt-3">
          <MenuSearch
            entries={[...items, ...operation]}
            value={query}
            onChange={setQuery}
          />
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.length > 0 && (
          <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">
            Gestão
          </p>
        )}
        {visibleItems.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors",
                active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} />
              {item.label}
            </Link>
          );
        })}

        {visibleOperation.length > 0 && (
          <p className="px-3 pb-1 pt-4 text-caption font-semibold uppercase tracking-wide text-ink-faint">
            Operação
          </p>
        )}
        {visibleOperation.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors",
                active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} />
              {item.label}
            </Link>
          );
        })}
        {q && visibleItems.length === 0 && visibleOperation.length === 0 && (
          <p className="px-3 py-2 text-small text-ink-muted">Nada no menu com “{query}”.</p>
        )}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-line p-3">
        <ThemeToggle initial={theme} />
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </div>
  );
}
