import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getTenantServicesByRef } from "@/lib/services";

const paramsSchema = z.string().uuid();

/**
 * Legacy permalink: the public event URL moved to /evento/<slug>. Resolve the
 * event by id and redirect so any previously shared /e/<uuid> links keep working.
 * Promoter/UTM links now point straight at /evento/<slug>?p=… so they don't rely
 * on this fallback.
 */
export default async function LegacyEventRedirect({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const parsed = paramsSchema.safeParse(eventId);
  if (!parsed.success) notFound();

  // Multi-tenant: o id resolve a org dona na plataforma (docs/MULTITENANT.md §3).
  const event = await getTenantServicesByRef("EVENT_ID", parsed.data)
    .then(({ services }) => services.publicEvents.findPublishedById(parsed.data))
    .catch(() => null);
  if (!event) notFound();

  redirect(`/evento/${event.slug}`);
}
