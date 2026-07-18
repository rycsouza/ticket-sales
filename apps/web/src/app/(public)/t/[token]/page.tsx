import { notFound } from "next/navigation";
import { NotFoundOrForbiddenError } from "@ingressos/core";
import { formatEventDate } from "@/lib/public-views";
import { getServices } from "@/lib/services";
import { TicketQr } from "./ticket-qr";

export const metadata = { title: "Seu ingresso — Ingressos" };

const STATUS_VIEW: Record<string, { label: string; className: string; note?: string }> = {
  VALID: { label: "Válido", className: "bg-emerald-100 text-emerald-800" },
  CHECKED_IN: {
    label: "Utilizado",
    className: "bg-slate-100 text-slate-600",
    note: "Este ingresso já passou pela portaria.",
  },
  BLOCKED: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-700",
    note: "Procure o suporte do evento.",
  },
  CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-600" },
  REFUNDED: { label: "Reembolsado", className: "bg-slate-100 text-slate-600" },
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (token.length < 20 || token.length > 200) notFound();

  const services = getServices();
  let ticket;
  try {
    ticket = await services.ticketsService.getPublicTicket(token);
  } catch (error) {
    if (error instanceof NotFoundOrForbiddenError) notFound();
    throw error;
  }

  const event = await services.publicEvents.findPublishedById(ticket.eventId);
  const status = STATUS_VIEW[ticket.status] ?? {
    label: ticket.status,
    className: "bg-slate-100 text-slate-600",
  };
  const dateLabel = event ? formatEventDate(event.startsAt, event.timezone) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center px-4 pb-16 pt-8">
      <div className="w-full rounded-2xl bg-white p-6 text-center shadow-md">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          Ingresso
        </p>
        {event && <h1 className="mt-1 text-xl font-bold leading-tight">{event.title}</h1>}
        <div className="mt-2 space-y-0.5 text-sm text-ink-600">
          {dateLabel && <p>📅 {dateLabel}</p>}
          {event?.venueName && (
            <p>
              📍 {event.venueName}
              {event.city ? ` — ${event.city}` : ""}
            </p>
          )}
        </div>

        <div className="my-5 flex justify-center">
          {/* QR rendered client-side from the URL token the buyer already
              holds — the server never echoes it back (FR-TKT-003/004) */}
          {ticket.status === "VALID" ? (
            <TicketQr />
          ) : (
            <div className="flex h-52 w-52 items-center justify-center rounded-xl bg-slate-50 text-sm text-ink-400">
              QR indisponível
            </div>
          )}
        </div>

        <span
          className={`inline-block rounded-full px-4 py-1.5 text-sm font-bold ${status.className}`}
        >
          {status.label}
        </span>
        {status.note && <p className="mt-2 text-xs text-ink-400">{status.note}</p>}

        {ticket.participantName && (
          <p className="mt-4 border-t border-dashed border-slate-200 pt-4 text-sm">
            Titular: <strong>{ticket.participantName}</strong>
          </p>
        )}
      </div>

      <p className="mt-4 max-w-xs text-center text-xs text-ink-400">
        Não compartilhe este link — quem tem o QR Code entra no seu lugar. Apresente-o na
        portaria com o brilho da tela no máximo.
      </p>
    </main>
  );
}
