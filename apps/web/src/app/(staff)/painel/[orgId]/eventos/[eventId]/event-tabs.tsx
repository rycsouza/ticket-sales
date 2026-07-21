"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Internal workspace navigation for a single event. Sections map only to routes
 * that exist today; the array is the single place to add more as the backend
 * grows (Pedidos, Divulgação, Configurações…).
 */
export function EventTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Visão geral", exact: true },
    { href: `${base}/ingressos`, label: "Ingressos e lotes" },
    { href: `${base}/promoters`, label: "Promotores e cupons" },
    { href: `${base}/financeiro`, label: "Financeiro" },
    { href: `${base}/pagina`, label: "Página do evento" },
    { href: `${base}/configuracoes`, label: "Configurações" },
  ];

  return (
    <nav
      aria-label="Seções do evento"
      className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-body font-medium transition-colors",
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
