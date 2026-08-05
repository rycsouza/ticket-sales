import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { hashToken, NotFoundOrForbiddenError } from "@ingressos/core";
import { EventDateTime, TimezoneDisclaimer } from "@/components/event-datetime";
import { orgVocab, type OrgVocab } from "@/lib/org-vocab";
import { getTenantServicesByRef } from "@/lib/services";
import { Badge, type BadgeTone } from "@/components/ui";
import { TicketQr } from "./ticket-qr";

export const metadata = { title: "Seu ingresso — Ingressos", robots: { index: false, follow: false } };

const statusView = (
  v: OrgVocab,
): Record<string, { label: string; tone: BadgeTone; note?: string }> => ({
  VALID: { label: flexLabel("Válido", v) , tone: "success" },
  CHECKED_IN: {
    label: flexLabel("Utilizado", v),
    tone: "neutral",
    note: `${v.ticketGender === "f" ? "Esta" : "Este"} ${v.ticket} já passou pel${v.checkinArea === "Embarque" ? "o embarque" : "a portaria"}.`,
  },
  BLOCKED: { label: flexLabel("Bloqueado", v), tone: "danger", note: `Procure o suporte ${v.ofEvent}.` },
  CANCELLED: { label: flexLabel("Cancelado", v), tone: "neutral" },
  REFUNDED: { label: flexLabel("Reembolsado", v), tone: "neutral" },
});

/** Particípios concordam com o gênero de "ingresso"/"vaga". */
function flexLabel(word: string, v: OrgVocab): string {
  return v.ticketGender === "f" ? word.replace(/o$/, "a") : word;
}

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 20 || token.length > 200) notFound();

  // Multi-tenant: o HASH do token resolve a org dona; a leitura roda no banco
  // do tenant (docs/MULTITENANT.md §3). Ref/token desconhecido → 404 genérico.
  let services;
  let ticket;
  try {
    ({ services } = await getTenantServicesByRef("TICKET_TOKEN", hashToken(token)));
    ticket = await services.ticketsService.getPublicTicket(token);
  } catch (error) {
    if (error instanceof NotFoundOrForbiddenError) notFound();
    throw error;
  }

  const event = await services.publicEvents.findPublishedById(ticket.eventId);
  // Nicho da org dona adapta o vocabulário do ingresso/vaga.
  const identity = await services.publicOrganizations
    .findIdentityById(ticket.organizationId)
    .catch(() => null);
  const vocab = orgVocab(identity?.niche ?? "EVENTOS");
  const status = statusView(vocab)[ticket.status] ?? {
    label: ticket.status,
    tone: "neutral" as const,
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center px-4 pb-16 pt-8">
      <div className="w-full rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <p className="text-caption font-semibold uppercase tracking-widest text-brand">{vocab.Ticket}</p>
        {event && <h1 className="mt-1 text-h2 leading-tight text-ink">{event.title}</h1>}
        <div className="mt-2 space-y-1 text-body text-ink-soft">
          {event?.startsAt && (
            <p className="flex items-center justify-center gap-2">
              <CalendarDays className="size-4 text-ink-muted" />
              <EventDateTime date={event.startsAt} eventTimezone={event.timezone} />
            </p>
          )}
          {event?.startsAt && (
            <TimezoneDisclaimer eventTimezone={event.timezone} reference={event.startsAt} />
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
