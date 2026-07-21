import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/services";
import { dashboardCtx, requireDashboardUser } from "@/lib/dashboard";
import { toEventResponse } from "@/lib/serializers";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { LocationEditor } from "./location-editor";

export const metadata: Metadata = { title: "Configurações — Ingressos" };

export default async function EventSettings({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId, eventId } = await params;
  const { userId } = await requireDashboardUser();
  const ctx = dashboardCtx(orgId, userId);

  let event;
  try {
    event = toEventResponse(await getServices().events.getEvent(ctx, eventId));
  } catch {
    redirect(`/painel/${orgId}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h2 text-ink">Configurações</h2>
        <p className="mt-0.5 text-small text-ink-muted">Local do evento e ponto no mapa.</p>
      </div>

      <Card>
        <CardHeader
          title="Localização"
          description="Defina o endereço e marque o ponto exato que aparece no mapa da página pública."
        />
        <CardBody>
          <LocationEditor
            orgId={orgId}
            eventId={eventId}
            initial={{
              venueName: event.venueName,
              addressLine: event.addressLine,
              city: event.city,
              state: event.state,
              latitude: event.latitude,
              longitude: event.longitude,
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
