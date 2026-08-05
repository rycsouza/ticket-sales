import { NextResponse } from "next/server";
import { storefrontImageKindSchema, ValidationFailedError } from "@ingressos/core";
import { route } from "@/lib/http";
import { getPlatformServices } from "@/lib/services";
import { requireOrgContext } from "@/lib/session";
import { resolvePlatformAdmin } from "@/lib/platform-admin";
import { NotFoundOrForbiddenError } from "@ingressos/core";

// Hard cap acima do maior limite por tipo (hero 5 MB) — o serviço aplica o
// limite fino por kind (CLAUDE_SECURITY_RULES §20).
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export const POST = route<{ orgId: string }>(async (request, { params, correlationId }) => {
  const ctx = await requireOrgContext(request, params.orgId, correlationId);
  // Superfície de admin da plataforma: além de membro, exige a allowlist.
  if (!(await resolvePlatformAdmin())) throw new NotFoundOrForbiddenError();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ValidationFailedError("Envie o arquivo como multipart/form-data");
  }

  const kind = storefrontImageKindSchema.parse(form.get("kind"));
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ValidationFailedError("Arquivo de imagem ausente");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationFailedError("Imagem excede o limite de 6 MB");
  }

  const body = new Uint8Array(await file.arrayBuffer());
  const { url } = await getPlatformServices().storefront.uploadImage(
    ctx,
    kind,
    body,
    file.type,
  );

  return NextResponse.json({ url });
});
