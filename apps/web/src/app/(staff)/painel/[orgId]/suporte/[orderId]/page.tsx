import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { DashboardHeader } from "../../../header";
import { brl, orderStatusLabel, ticketStatusLabel } from "../labels";
import { NoteForm, TicketActions } from "./console-client";

export const metadata: Metadata = { title: "Pedido — Suporte" };

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
  REFUNDED: "Reembolsado",
  CHARGEBACK: "Chargeback",
  CANCELLED: "Cancelado",
};

function dt(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; orderId: string }>;
}) {
  const { orgId, orderId } = await params;
  const { userId } = await requireDashboardUser();
  const orgs = await getServices().identity.listMyOrganizations(userId);
  const org = orgs.find((o) => o.organization.id === orgId);
  if (!org) redirect("/painel");

  const ctx = dashboardCtx(orgId, userId);
  let timeline;
  try {
    timeline = await getServices().support.getOrderTimeline(ctx, orderId);
  } catch {
    notFound();
  }

  const { order, payments, tickets, events, notes } = timeline;

  return (
    <div className="mx-auto max-w-2xl">
      <DashboardHeader orgName={org.organization.name} orgId={orgId} />
      <main className="space-y-6 p-4">
        <div>
          <Link href={`/painel/${orgId}/suporte`} className="text-sm text-brand-600">
            ← Voltar à busca
          </Link>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-ink-900">{order.buyerName}</h1>
              <p className="text-sm text-ink-400">
                Pedido <span className="font-mono">{order.code}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-600">
              {orderStatusLabel(order.status)}
            </span>
          </div>
        </div>

        {/* Buyer + totals */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 text-sm shadow-sm">
          <Cell label="E-mail" value={order.buyerEmail} />
          <Cell label="Telefone" value={order.buyerPhone ?? "—"} />
          <Cell label="Documento" value={order.buyerDocument ?? "—"} />
          <Cell label="Pago em" value={dt(order.paidAt)} />
          <Cell label="Subtotal" value={brl(order.subtotalCents)} />
          <Cell label="Desconto" value={brl(order.discountCents)} />
          <Cell label="Taxa" value={`${brl(order.feeCents)} (${order.feeMode})`} />
          <Cell label="Total" value={brl(order.totalCents)} strong />
        </section>

        {/* Payments */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-400">Pagamentos</h2>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            {payments.length === 0 ? (
              <p className="text-sm text-ink-400">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {p.method} · {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    <span className="font-medium">{brl(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Tickets + actions */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-400">
            Ingressos ({tickets.length})
          </h2>
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {t.participantName ?? "Sem titular definido"}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {t.participantEmail ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
                    {ticketStatusLabel(t.status)}
                  </span>
                </div>
                <TicketActions orgId={orgId} ticketId={t.id} status={t.status} />
              </div>
            ))}
          </div>
        </section>

        {/* Timeline */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-400">Histórico</h2>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-900">{e.action}</span>
                    <span className="block text-xs text-ink-400">
                      {dt(e.createdAt)} · {e.actorType}
                      {e.justification ? ` · ${e.justification}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Internal notes */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-400">
            Notas internas
          </h2>
          <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
            {notes.length > 0 && (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-amber-50 p-3 text-sm text-ink-900">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-400">{dt(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm orgId={orgId} orderId={orderId} />
            <p className="text-xs text-ink-400">Visível apenas para a equipe; nunca para o comprador.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-white p-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`truncate ${strong ? "text-base font-bold text-ink-900" : "text-ink-900"}`}>
        {value}
      </p>
    </div>
  );
}
