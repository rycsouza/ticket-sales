import { NextResponse } from "next/server";
import { createSectorSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createSectorSchema.parse(await readJsonBody(request));

    const sector = await getServices().events.createSector(ctx, params.eventId, input);

    return NextResponse.json(
      { id: sector.id, name: sector.name, capacity: sector.capacity },
      { status: 201 },
    );
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const sectors = await getServices().events.listSectors(ctx, params.eventId);

    return NextResponse.json({
      sectors: sectors.map((sector) => ({
        id: sector.id,
        name: sector.name,
        capacity: sector.capacity,
      })),
    });
  },
);
