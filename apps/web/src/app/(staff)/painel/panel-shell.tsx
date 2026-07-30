"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  BarChart3,
  Users,
  Megaphone,
  Receipt,
  Sparkles,
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
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { orgVocab, type OrgVocab } from "@/lib/org-vocab";
import type { OrgNiche } from "@ingressos/core";
import { ThemeToggle, type PanelTheme } from "./theme-toggle";

// Atalho pra LP artesanal da Jovitur — bespoke pra esse cliente específico,
// não é uma funcionalidade genérica de "LP configurável" (ver decisão de
// arquitetura: páginas por cliente são feitas sob medida, não autoatendimento).
const JOVITUR_ORG_SLUG = "jovitur";

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
  return [
    {
      href: base,
      label: vocab.Events,
      icon: CalendarDays,
      match: (p) => p === base || p.startsWith(`${base}/eventos`),
    },
    {
      href: `${base}/relatorio`,
      label: "Relatório",
      icon: BarChart3,
      match: (p) => p.startsWith(`${base}/relatorio`),
    },
    {
      href: `${base}/clientes`,
      label: "Clientes",
      icon: Users,
      match: (p) => p.startsWith(`${base}/clientes`),
    },
    {
      href: `${base}/afiliados`,
      label: "Afiliados",
      icon: Megaphone,
      match: (p) => p.startsWith(`${base}/afiliados`),
    },
    {
      href: `${base}/ofertas`,
      label: "Ofertas",
      icon: Sparkles,
      match: (p) => p.startsWith(`${base}/ofertas`),
    },
    {
      href: `${base}/pedidos`,
      label: "Pedidos",
      icon: Receipt,
      match: (p) => p.startsWith(`${base}/pedidos`),
    },
  ];
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
  theme = "light",
  children,
}: {
  org: NavOrg;
  multiOrg: boolean;
  isPlatformAdmin?: boolean;
  theme?: PanelTheme;
  children: ReactNode;
}) {
  return (
    <div id="panel-shell" data-theme={theme} className="min-h-svh bg-page text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent
          org={org}
          multiOrg={multiOrg}
          isPlatformAdmin={isPlatformAdmin}
          theme={theme}
        />
      </aside>

      {/* Mobile top bar (brand + org context + search) */}
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="ml-auto truncate text-small font-medium text-ink-muted">{org.name}</span>
        </div>
        <NavSearch orgId={org.slug} placeholder={`Buscar ${orgVocab(org.niche).events}`} />
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

function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-fg">
        <Ticket className="size-5" strokeWidth={2} />
      </span>
      <span className="text-h3 font-semibold text-ink">Ingressos</span>
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
              <li>
                <Link
                  href="/checkin"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                >
                  <ScanLine className="size-5 shrink-0" strokeWidth={1.75} />
                  {vocab.checkinArea}
                </Link>
              </li>
              <li>
                <Link
                  href={`/painel/${org.slug}/configuracoes`}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                >
                  <Settings className="size-5 shrink-0" strokeWidth={1.75} />
                  Configurações
                </Link>
              </li>
              {org.slug === JOVITUR_ORG_SLUG && (
                <li>
                  <Link
                    href="/jovitur"
                    target="_blank"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                  >
                    <Globe className="size-5 shrink-0" strokeWidth={1.75} />
                    Ver LP
                    <ExternalLink className="ml-auto size-3.5 text-ink-faint" />
                  </Link>
                </li>
              )}
              {isPlatformAdmin && (
                <li>
                  <Link
                    href="/plataforma"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-body font-medium text-ink-soft transition-colors hover:bg-hover"
                  >
                    <ShieldCheck className="size-5 shrink-0" strokeWidth={1.75} />
                    Plataforma
                  </Link>
                </li>
              )}
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

/** Quick search in the navbar — routes to the events list filtered by the term. */
function NavSearch({
  orgId,
  placeholder = "Buscar eventos",
  onNavigate,
}: {
  orgId: string;
  placeholder?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/painel/${orgId}?q=${encodeURIComponent(term)}` : `/painel/${orgId}`);
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
        placeholder={placeholder}
        aria-label={placeholder}
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
}: {
  org: NavOrg;
  multiOrg: boolean;
  isPlatformAdmin: boolean;
  theme: PanelTheme;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const vocab = orgVocab(org.niche);
  const items = navItems(org.slug, vocab);

  async function logout() {
    await logoutRequest();
    router.push("/entrar");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand + org */}
      <div className="border-b border-line px-4 py-4">
        <BrandMark />
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-small font-medium text-ink-soft">{org.name}</span>
          {multiOrg && (
            <Link
              href="/painel"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <ArrowLeftRight className="size-3.5" />
              Trocar
            </Link>
          )}
        </div>
        <div className="mt-3">
          <NavSearch orgId={org.slug} placeholder={`Buscar ${vocab.events}`} />
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">
          Gestão
        </p>
        {items.map((item) => {
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

        <p className="px-3 pb-1 pt-4 text-caption font-semibold uppercase tracking-wide text-ink-faint">
          Operação
        </p>
        <Link
          href="/checkin"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <ScanLine className="size-5 shrink-0" strokeWidth={1.75} />
          {vocab.checkinArea}
        </Link>
        <Link
          href={`/painel/${org.slug}/configuracoes`}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <Settings className="size-5 shrink-0" strokeWidth={1.75} />
          Configurações
        </Link>
        {org.slug === JOVITUR_ORG_SLUG && (
          <Link
            href="/jovitur"
            target="_blank"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <Globe className="size-5 shrink-0" strokeWidth={1.75} />
            Ver LP
            <ExternalLink className="ml-auto size-3.5 text-ink-faint" />
          </Link>
        )}
        {isPlatformAdmin && (
          <Link
            href="/plataforma"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <ShieldCheck className="size-5 shrink-0" strokeWidth={1.75} />
            Plataforma
          </Link>
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
