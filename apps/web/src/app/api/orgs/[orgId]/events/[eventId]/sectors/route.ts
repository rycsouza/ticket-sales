import { NextResponse } from "next/server";
import { createSectorSchema } from "@ingressos/core";
import { readJsonBody, route } from "@/lib/http";
import { getTenantServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";

export const POST = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);
    const input = createSectorSchema.parse(await readJsonBody(request));

    const sector = await (await getTenantServices(params.orgId)).events.createSector(ctx, params.eventId, input);

    return NextResponse.json(
      { id: sector.id, name: sector.name, capacity: sector.capacity },
      { status: 201 },
    );
  },
);

export const GET = route<{ orgId: string; eventId: string }>(
  async (request, { params, correlationId }) => {
    const ctx = await requireOrgContext(request, params.orgId, correlationId);

    const sectors = await (await getTenantServices(params.orgId)).events.listSectors(ctx, params.eventId);

    return NextResponse.json({
      sectors: sectors.map((sector) => ({
        id: sector.id,
        name: sector.name,
        capacity: sector.capacity,
      })),
    });
  },
);
