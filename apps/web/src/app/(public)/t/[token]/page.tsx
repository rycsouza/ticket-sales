import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { NotFoundOrForbiddenError } from "@ingressos/core";
import { formatEventDate } from "@/lib/public-views";
import { getServices } from "@/lib/services";
import { Badge, type BadgeTone } from "@/components/ui";
import { TicketQr } from "./ticket-qr";

export const metadata = { title: "Seu ingresso — Ingressos", robots: { index: false, follow: false } };

const STATUS_VIEW: Record<string, { label: string; tone: BadgeTone; note?: string }> = {
  VALID: { label: "Válido", tone: "success" },
  CHECKED_IN: {
    label: "Utilizado",
    tone: "neutral",
    note: "Este ingresso já passou pela portaria.",
  },
  BLOCKED: { label: "Bloqueado", tone: "danger", note: "Procure o suporte do evento." },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
};

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
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
  const status = STATUS_VIEW[ticket.status] ?? { label: ticket.status, tone: "neutral" as const };
  const dateLabel = event ? formatEventDate(event.startsAt, event.timezone) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center px-4 pb-16 pt-8">
      <div className="w-full rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <p className="text-caption font-semibold uppercase tracking-widest text-brand">Ingresso</p>
        {event && <h1 className="mt-1 text-h2 leading-tight text-ink">{event.title}</h1>}
        <div className="mt-2 space-y-1 text-body text-ink-soft">
          {dateLabel && (
            <p className="flex items-center justify-center gap-2">
              <CalendarDays className="size-4 text-ink-muted" />
              {dateLabel}
            </p>
          )}
          {event?.venueName && (
            <p className="flex items-center justify-center gap-2">
              <MapPin className="size-4 text-ink-muted" />
              {event.venueName}
              {event.city ? ` — ${event.city}` : ""}
            </p>
          )}
        </div>

        <div className="my-5 flex justify-center">
          {ticket.status === "VALID" ? (
            <TicketQr />
          ) : (
            <div className="flex size-52 items-center justify-center rounded-xl bg-subtle text-body text-ink-muted">
              QR indisponível
            </div>
          )}
        </div>

        <Badge tone={status.tone} className="px-4 py-1.5 text-body">
          {status.label}
        </Badge>
        {status.note && <p className="mt-2 text-small text-ink-muted">{status.note}</p>}

        {ticket.participantName && (
          <p className="mt-4 border-t border-dashed border-line pt-4 text-body text-ink-soft">
            Titular: <strong className="text-ink">{ticket.participantName}</strong>
          </p>
        )}
      </div>

      <p className="mt-4 max-w-xs text-center text-small text-ink-muted">
        Não compartilhe este link — quem tem o QR Code entra no seu lugar. Apresente-o na portaria
        com o brilho da tela no máximo.
      </p>
    </main>
  );
}
