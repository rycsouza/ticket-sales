import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { getServices } from "@/lib/services";
import { buildPublicEventView } from "@/lib/public-views";
import { EventPageView } from "@/app/(public)/evento/[slug]/event-page-view";

export const metadata: Metadata = {
  title: "Prévia do evento — Ingressos",
  robots: { index: false, follow: false },
};

/**
 * Staff-only preview of the public sales page — works even for DRAFT events, so
 * the producer can see exactly how the checkout looks before publishing. Reuses
 * the exact same rendering as the live page; org membership is enforced by
 * events.getEvent (role-guarded, org-scoped).
 */
export default async function EventPreviewPage({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let event;
  try {
    event = await getServices().events.getEvent(ctx, eventId);
  } catch {
    redirect(`/painel/${orgId}`);
  }

  const view = await buildPublicEventView(event);
  const mpPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY || null;

  return <EventPageView event={view} mpPublicKey={mpPublicKey} preview />;
}
