"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  BarChart3,
  Users,
  LifeBuoy,
  ScanLine,
  LogOut,
  Menu,
  X,
  Ticket,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NavOrg = { id: string; name: string };

interface NavItem {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: (pathname: string) => boolean;
}

function navItems(orgId: string): NavItem[] {
  const base = `/painel/${orgId}`;
  return [
    {
      href: base,
      label: "Eventos",
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
      href: `${base}/compradores`,
      label: "Compradores",
      icon: Users,
      match: (p) => p.startsWith(`${base}/compradores`),
    },
    {
      href: `${base}/suporte`,
      label: "Suporte",
      icon: LifeBuoy,
      match: (p) => p.startsWith(`${base}/suporte`),
    },
  ];
}

export function PanelShell({
  org,
  multiOrg,
  children,
}: {
  org: NavOrg;
  multiOrg: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-page">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent org={org} multiOrg={multiOrg} onNavigate={() => undefined} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-hover"
        >
          <Menu className="size-5" />
        </button>
        <BrandMark />
        <span className="ml-auto truncate text-small font-medium text-ink-muted">{org.name}</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "var(--overlay)" }}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-line bg-surface">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3 rounded-lg p-2 text-ink-muted transition-colors hover:bg-hover"
            >
              <X className="size-5" />
            </button>
            <SidebarContent org={org} multiOrg={multiOrg} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
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

function SidebarContent({
  org,
  multiOrg,
  onNavigate,
}: {
  org: NavOrg;
  multiOrg: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = navItems(org.id);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
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
              onClick={onNavigate}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <ArrowLeftRight className="size-3.5" />
              Trocar
            </Link>
          )}
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
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors",
                active
                  ? "bg-brand-soft text-brand"
                  : "text-ink-soft hover:bg-hover hover:text-ink",
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
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <ScanLine className="size-5 shrink-0" strokeWidth={1.75} />
          Portaria
        </Link>
      </nav>

      {/* Footer */}
      <div className="border-t border-line p-3">
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
